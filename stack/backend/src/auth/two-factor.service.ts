import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type PublicUser } from './auth.service';
import { decryptSecret, encryptSecret } from './secret-box';
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from './recovery-codes';
import { generateSecret, otpauthUrl, verifyTotp } from './totp';
import { readTicket } from './ticket';
import { AUTH_CLOCK, sha256Hex, type Clock } from './tokens';

export const WRONG_PASSWORD = 'Password is incorrect';
export const WRONG_CODE = 'That code is not right. Check your authenticator app, or use a recovery code.';
export const TICKET_EXPIRED = 'This sign-in has expired. Log in again.';
const NOT_ON = 'Two-factor sign-in is not on for this account';
const ALREADY_ON = 'Two-factor sign-in is already on. Turn it off first.';
const SETUP_FIRST = 'Set up two-factor sign-in first';
const TOO_MANY = 'Too many attempts. Log in again.';

/** Codes a ticket may be used with, per ticket and client address, per minute. */
export const TICKET_ATTEMPTS_PER_MINUTE = 5;
const MINUTE_MS = 60_000;
/** Above this many tracked tickets, the expired counters are dropped. */
const MAX_TRACKED_TICKETS = 5_000;

/**
 * Two-factor sign-in (TOTP with recovery codes). The secret is stored encrypted; recovery codes are
 * stored as sha256 and used once. Replay protection keeps the last accepted TOTP step per account in
 * memory, keyed to the secret, so a code cannot be used twice within its window.
 */
@Injectable()
export class TwoFactorService {
  private readonly lastStep = new Map<number, { secret: string; step: number }>();
  private readonly attempts = new Map<string, { count: number; windowStart: number }>();
  /** Tickets that completed a sign-in, by jti, until they would have expired anyway. */
  private readonly consumed = new Map<string, number>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    @Inject(AUTH_CLOCK) private readonly now: Clock,
  ) {}

  /** Stores a pending secret (replacing an earlier pending one) and returns it with its otpauth URL. */
  async setup(userId: number): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.account(userId);
    if (user.totpEnabledAt) throw new ConflictException(ALREADY_ON);
    const secret = generateSecret();
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, totpEnabledAt: null },
      data: { totpSecret: encryptSecret(secret) },
    });
    if (count === 0) throw new ConflictException(ALREADY_ON);
    return { secret, otpauthUrl: otpauthUrl(secret, user.name) };
  }

  /** Confirms the pending secret with a code, switches two-factor sign-in on, and returns 10 new recovery codes. */
  async enable(userId: number, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.account(userId);
    if (user.totpEnabledAt) throw new ConflictException(ALREADY_ON);
    if (!user.totpSecret) throw new BadRequestException(SETUP_FIRST);
    const secret = decryptSecret(user.totpSecret);
    const step = verifyTotp(secret, code, this.unixSeconds());
    if (step === null || !this.acceptStep(userId, secret, step)) throw new BadRequestException(WRONG_CODE);

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.writeTx(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, totpEnabledAt: null, totpSecret: user.totpSecret },
        data: { totpEnabledAt: this.now() },
      });
      if (count === 0) throw new ConflictException('The two-factor setup changed. Start again.');
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await tx.recoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
      });
    });
    return { recoveryCodes };
  }

  /**
   * Switches two-factor sign-in off: needs the password and a code (TOTP or recovery). Clears the secret
   * and the recovery codes, and bumps tokenVersion, so the caller gets a fresh session token back.
   */
  async disable(userId: number, password: string, code: string): Promise<{ token: string }> {
    await this.passwordAndSecondFactor(userId, password, code);
    const updated = await this.prisma.writeTx(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: { totpSecret: null, totpEnabledAt: null, tokenVersion: { increment: 1 } },
      });
    });
    this.lastStep.delete(userId);
    return { token: await this.auth.issueSession(updated) };
  }

  /** Replaces the recovery codes with a new set of ten. Needs the password and a code. */
  async regenerateRecoveryCodes(userId: number, password: string, code: string): Promise<{ recoveryCodes: string[] }> {
    await this.passwordAndSecondFactor(userId, password, code);
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.writeTx(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await tx.recoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })),
      });
    });
    return { recoveryCodes };
  }

  /**
   * The second step of a login. The ticket (from the password step) must be valid, unused and for an
   * account that still has two-factor sign-in on. Returns the session, like a login does.
   */
  async verifyLogin(ticket: string, code: string, ip: string): Promise<{ user: PublicUser; token: string }> {
    const claims = await readTicket(this.jwt, ticket);
    if (!claims) throw new UnauthorizedException(TICKET_EXPIRED);
    if (!this.takeAttempt(`${sha256Hex(ticket)}|${ip}`)) throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
    this.pruneConsumed();
    if (this.consumed.has(claims.jti) || this.inFlight.has(claims.jti)) throw new UnauthorizedException(TICKET_EXPIRED);

    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.bannedAt || user.tokenVersion !== claims.v || !user.totpEnabledAt || !user.totpSecret) {
      throw new UnauthorizedException(TICKET_EXPIRED);
    }

    // In flight until the code is judged, so one ticket cannot be tried in parallel.
    this.inFlight.add(claims.jti);
    try {
      if (!(await this.consumeSecondFactor(user.id, decryptSecret(user.totpSecret), code))) {
        throw new UnauthorizedException(WRONG_CODE);
      }
      this.consumed.set(claims.jti, claims.exp * 1000);
    } finally {
      this.inFlight.delete(claims.jti);
    }
    return this.auth.completeLogin(user);
  }

  /** Checks the password and a second-factor code, for the operations that need both. Returns the account. */
  private async passwordAndSecondFactor(userId: number, password: string, code: string): Promise<User> {
    const user = await this.account(userId);
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException(WRONG_PASSWORD);
    if (!user.totpEnabledAt || !user.totpSecret) throw new BadRequestException(NOT_ON);
    if (!(await this.consumeSecondFactor(userId, decryptSecret(user.totpSecret), code))) {
      throw new BadRequestException(WRONG_CODE);
    }
    return user;
  }

  /**
   * Accepts a 6-digit TOTP (once per step) or a recovery code (once, ever). Returns false for anything
   * else. A recovery code is consumed by a conditional write, so two requests cannot both spend it.
   */
  private async consumeSecondFactor(userId: number, secret: string, input: string): Promise<boolean> {
    const compact = input.replace(/\s/g, '');
    if (/^\d{6}$/.test(compact)) {
      const step = verifyTotp(secret, compact, this.unixSeconds());
      return step !== null && this.acceptStep(userId, secret, step);
    }
    if (normalizeRecoveryCode(input) === null) return false;
    const { count } = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(input), usedAt: null },
      data: { usedAt: this.now() },
    });
    return count === 1;
  }

  /** Records a TOTP step as used. False when the step is not later than the last one accepted for this secret. */
  private acceptStep(userId: number, secret: string, step: number): boolean {
    const last = this.lastStep.get(userId);
    if (last && last.secret === secret && step <= last.step) return false;
    this.lastStep.set(userId, { secret, step });
    return true;
  }

  /** Counts an attempt for the ticket and address. False once the limit for the minute is used up. */
  private takeAttempt(key: string): boolean {
    const nowMs = this.now().getTime();
    if (this.attempts.size > MAX_TRACKED_TICKETS) {
      for (const [k, v] of this.attempts) if (nowMs - v.windowStart >= MINUTE_MS) this.attempts.delete(k);
    }
    const entry = this.attempts.get(key);
    if (!entry || nowMs - entry.windowStart >= MINUTE_MS) {
      this.attempts.set(key, { count: 1, windowStart: nowMs });
      return true;
    }
    if (entry.count >= TICKET_ATTEMPTS_PER_MINUTE) return false;
    entry.count += 1;
    return true;
  }

  private pruneConsumed(): void {
    const nowMs = this.now().getTime();
    for (const [jti, expiresMs] of this.consumed) {
      if (expiresMs <= nowMs) this.consumed.delete(jti);
    }
  }

  private async account(userId: number): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private unixSeconds(): number {
    return Math.floor(this.now().getTime() / 1000);
  }
}
