import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { CookieOptions } from 'express';
import { getEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { Permission } from '../permissions/catalog';
import { PermissionsService } from '../permissions/permissions.service';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schemas';
import { signTicket } from './ticket';

export const SESSION_COOKIE = 'pt_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const INVALID_CREDENTIALS = 'Invalid email or password';
const TAKEN = 'Username or email is already taken';
const WRONG_CURRENT_PASSWORD = 'Current password is incorrect';
const WRONG_PASSWORD = 'Password is incorrect';
const SAME_PASSWORD = 'New password must be different from the current one';
export const SUSPENDED = 'This account has been suspended';

/**
 * bcrypt hash of a throwaway string. Compared against when the email is unknown,
 * so unknown and wrong-password logins take the same time.
 */
const DUMMY_HASH = '$2b$12$p6NH0HFuK2knoUixh7HYG.elqGEaSTS9psr306CWB/Wbn41uCGbse';

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  /** The effective permissions, sorted. Empty for ordinary users. */
  permissions: Permission[];
  createdAt: string;
  /** True once the user has followed the link in the verification email. */
  emailVerified: boolean;
  /** True when two-factor sign-in is switched on (a pending, unconfirmed secret does not count). */
  twoFactorEnabled: boolean;
}

export function toPublicUser(
  user: Pick<User, 'id' | 'name' | 'email' | 'createdAt' | 'emailVerifiedAt' | 'totpEnabledAt'>,
  permissions: readonly Permission[],
): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    permissions: [...permissions].sort(),
    createdAt: user.createdAt.toISOString(),
    emailVerified: user.emailVerifiedAt !== null && user.emailVerifiedAt !== undefined,
    twoFactorEnabled: user.totpEnabledAt !== null && user.totpEnabledAt !== undefined,
  };
}

/**
 * The result of the password step of a login. With two-factor sign-in on there is no session yet:
 * the caller gets a ticket to exchange with the second factor (see TwoFactorService.verifyLogin).
 */
export type LoginResult =
  | { kind: 'session'; user: PublicUser; token: string }
  | { kind: 'twoFactor'; ticket: string };

/** The one place the session cookie name and options live. Used by login, register and logout. */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().cookieSecure,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly permissions: PermissionsService,
  ) {}

  async register(input: RegisterInput): Promise<{ user: PublicUser; token: string }> {
    const nameLower = input.name.toLowerCase();
    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ nameLower }, { email: input.email }] },
      select: { id: true },
    });
    if (taken) throw new ConflictException(TAKEN);

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { name: input.name, nameLower, email: input.email, passwordHash },
      });
    } catch (err) {
      // Lost a race with another registration of the same name or email.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(TAKEN);
      }
      throw err;
    }
    // A new account has no groups yet.
    return { user: toPublicUser(user, []), token: await this.issueSession(user) };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !matches) throw new UnauthorizedException(INVALID_CREDENTIALS);
    // Checked after the password, so only someone who knows it learns the account is suspended.
    if (user.bannedAt) throw new ForbiddenException(SUSPENDED);
    if (user.totpEnabledAt) {
      return { kind: 'twoFactor', ticket: await signTicket(this.jwt, user) };
    }
    return { kind: 'session', ...(await this.completeLogin(user)) };
  }

  /** A session for a user who has passed every sign-in step: the public user and a session token. */
  async completeLogin(user: User): Promise<{ user: PublicUser; token: string }> {
    const permissions = [...(await this.permissions.effective(user.id))];
    return { user: toPublicUser(user, permissions), token: await this.issueSession(user) };
  }

  async getPublicUser(userId: number): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const permissions = [...(await this.permissions.effective(user.id))];
    return toPublicUser(user, permissions);
  }

  /**
   * Checks the current password, stores a new hash and bumps tokenVersion, so every older
   * session token (on every device) stops working. Returns a token for the new version.
   */
  async changePassword(userId: number, input: ChangePasswordInput): Promise<string> {
    // Compares the two inputs only, so it needs no database read.
    if (input.newPassword === input.currentPassword) throw new BadRequestException(SAME_PASSWORD);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException(WRONG_CURRENT_PASSWORD);
    }
    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return this.issueSession(updated);
  }

  /** Verifies the password, then deletes the user. Their results go with them (ON DELETE CASCADE). */
  async deleteAccount(userId: number, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException(WRONG_PASSWORD);
    }
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch (err) {
      // Already deleted by a concurrent request.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new UnauthorizedException();
      }
      throw err;
    }
  }

  /** Invalidates every session token the user holds, on every device. */
  async revokeSessions(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  /**
   * A session token for the user's current tokenVersion. The `v` claim must match User.tokenVersion at
   * verify time, which is what makes logout effective. Public for the 2FA and reset flows.
   */
  issueSession(user: Pick<User, 'id' | 'name' | 'tokenVersion'>): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, name: user.name, v: user.tokenVersion });
  }
}
