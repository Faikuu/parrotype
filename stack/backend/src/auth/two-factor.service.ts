import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { MailLanguage } from '../mail/locale';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type PublicUser } from './auth.service';
import { decryptSecret, encryptSecret } from './secret-box';
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode, recoveryCodeLookupHashes } from './recovery-codes';
import { generateSecret, otpauthUrl, verifyTotp } from './totp';
import { readTicket } from './ticket';
import { AUTH_CLOCK, sha256Hex, type Clock } from './tokens';

export const WRONG_PASSWORD = 'Password is incorrect';
export const WRONG_CODE = 'That code is not right. Check your authenticator app, or use a recovery code.';
export const TICKET_EXPIRED = 'This sign-in has expired. Log in again.';
export const LOCKED = 'Too many incorrect codes. Try again in 15 minutes.';
const NOT_ON = 'Two-factor sign-in is not on for this account';
const ALREADY_ON = 'Two-factor sign-in is already on. Turn it off first.';
const SETUP_FIRST = 'Set up two-factor sign-in first';
const TOO_MANY = 'Too many attempts. Log in again.';
const SETUP_CHANGED = 'The two-factor setup changed. Start again.';

/** Failed second-factor checks (TOTP or recovery code) that lock the second factor, and how long the lock lasts. */
export const LOCK_AFTER_FAILURES = 8;
export const LOCK_MINUTES = 15;
/** Codes a ticket may be used with, per ticket and client address, per minute. */
export const TICKET_ATTEMPTS_PER_MINUTE = 5;
const MINUTE_MS = 60_000;
/** Above this many tracked tickets, the expired counters are dropped. */
const MAX_TRACKED_TICKETS = 5_000;

/** What became of one second-factor input. */
type Judgement = 'accepted' | 'rejected' | 'stale';

/** Thrown inside a transaction to undo its writes: the login ticket is no longer the newest. */
class StaleTicket extends Error {}

/**
 * Two-factor sign-in (TOTP with recovery codes). The secret is stored encrypted; recovery codes are stored
 * as an HMAC and each works once.
 *
 * All state that must hold across requests and processes lives in the user row: the last accepted TOTP
 * step (replay), the failure counter and lock, and the nonce of the newest login ticket (single use). Each
 * is changed by a conditional write, so two requests racing for the same code or ticket cannot both win.
 * The only in-memory state is a per-ticket, per-address attempt counter, a secondary limit per process.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly attempts = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
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

  /**
   * Confirms the pending secret with a code, switches two-factor sign-in on, and returns 10 new recovery codes.
   * The code's step is recorded, so it cannot be replayed at the next login.
   */
  async enable(userId: number, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.account(userId);
    if (user.totpEnabledAt) throw new ConflictException(ALREADY_ON);
    if (!user.totpSecret) throw new BadRequestException(SETUP_FIRST);
    const secret = decryptSecret(user.totpSecret);
    const step = verifyTotp(secret, code, this.unixSeconds());
    if (step === null) throw new BadRequestException(WRONG_CODE);

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.writeTx(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, totpEnabledAt: null, totpSecret: user.totpSecret },
        data: { totpEnabledAt: this.now(), totpLastStep: step, twoFactorFailures: 0, twoFactorLockedUntil: null },
      });
      if (count === 0) throw new ConflictException(SETUP_CHANGED);
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await tx.recoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
      });
    });
    return { recoveryCodes };
  }

  /**
   * Switches two-factor sign-in off: needs the password and a code (TOTP or recovery). Clears the secret,
   * the recovery codes and the second-factor state, and bumps tokenVersion, so the caller gets a fresh
   * session token back.
   */
  async disable(userId: number, password: string, code: string, lang: MailLanguage): Promise<{ token: string }> {
    await this.passwordAndSecondFactor(userId, password, code, lang);
    const updated = await this.prisma.writeTx(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: {
          totpSecret: null,
          totpEnabledAt: null,
          totpLastStep: null,
          loginTicketNonce: null,
          twoFactorFailures: 0,
          twoFactorLockedUntil: null,
          tokenVersion: { increment: 1 },
        },
      });
    });
    return { token: await this.auth.issueSession(updated) };
  }

  /** Replaces the recovery codes with a new set of ten. Needs the password and a code. */
  async regenerateRecoveryCodes(
    userId: number,
    password: string,
    code: string,
    lang: MailLanguage,
  ): Promise<{ recoveryCodes: string[] }> {
    await this.passwordAndSecondFactor(userId, password, code, lang);
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
   * The second step of a login. The ticket (from the password step) must be the newest one issued for the
   * account and unused, and the account must still have two-factor sign-in on. Returns the session.
   */
  async verifyLogin(
    ticket: string,
    code: string,
    ip: string,
    lang: MailLanguage,
  ): Promise<{ user: PublicUser; token: string }> {
    const claims = await readTicket(this.jwt, ticket);
    if (!claims) throw new UnauthorizedException(TICKET_EXPIRED);
    if (!this.takeAttempt(`${sha256Hex(ticket)}|${ip}`)) throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);

    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (
      !user ||
      user.bannedAt ||
      user.tokenVersion !== claims.v ||
      !user.totpEnabledAt ||
      !user.totpSecret ||
      user.loginTicketNonce !== claims.n
    ) {
      throw new UnauthorizedException(TICKET_EXPIRED);
    }
    this.assertNotLocked(user);

    const judgement = await this.judge(user.id, decryptSecret(user.totpSecret), code, claims.n);
    if (judgement === 'stale') throw new UnauthorizedException(TICKET_EXPIRED);
    if (judgement === 'rejected') {
      if (await this.recordFailure(user, lang)) throw this.lockedError();
      throw new UnauthorizedException(WRONG_CODE);
    }
    return this.auth.completeLogin(user);
  }

  /** Checks the password and a second-factor code, for the operations that need both. Returns the account. */
  private async passwordAndSecondFactor(userId: number, password: string, code: string, lang: MailLanguage): Promise<User> {
    const user = await this.account(userId);
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException(WRONG_PASSWORD);
    if (!user.totpEnabledAt || !user.totpSecret) throw new BadRequestException(NOT_ON);
    this.assertNotLocked(user);
    if ((await this.judge(userId, decryptSecret(user.totpSecret), code, null)) !== 'accepted') {
      if (await this.recordFailure(user, lang)) throw this.lockedError();
      throw new BadRequestException(WRONG_CODE);
    }
    return user;
  }

  /**
   * Judges one input and, if it is right, spends it, all in one transaction. With a ticket nonce the
   * ticket is spent in the same transaction (the nonce is cleared), so a code cannot be accepted for a
   * ticket that has been superseded. Returns 'stale' when that ticket is no longer current.
   *
   * A TOTP is accepted once: its step must be later than User.totpLastStep, which is then set to it.
   * A recovery code is accepted once, ever: its row is marked used by a conditional write.
   */
  private async judge(userId: number, secret: string, input: string, ticketNonce: string | null): Promise<Judgement> {
    const compact = input.replace(/\s/g, '');
    const now = this.now();
    const ticketWhere = ticketNonce !== null ? { loginTicketNonce: ticketNonce } : {};
    const ticketClear = ticketNonce !== null ? { loginTicketNonce: null } : {};
    try {
      return await this.prisma.writeTx<Judgement>(async (tx): Promise<Judgement> => {
        if (/^\d{6}$/.test(compact)) {
          const step = verifyTotp(secret, compact, this.unixSeconds());
          if (step === null) return 'rejected';
          const { count } = await tx.user.updateMany({
            where: { id: userId, ...ticketWhere, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
            data: { totpLastStep: step, twoFactorFailures: 0, ...ticketClear },
          });
          if (count === 1) return 'accepted';
          return ticketNonce !== null && !(await this.ticketIs(tx, userId, ticketNonce)) ? 'stale' : 'rejected';
        }

        if (normalizeRecoveryCode(input) === null) return 'rejected';
        const spent = await tx.recoveryCode.updateMany({
          where: { userId, codeHash: { in: recoveryCodeLookupHashes(input) }, usedAt: null },
          data: { usedAt: now },
        });
        if (spent.count !== 1) return 'rejected';
        const claimed = await tx.user.updateMany({
          where: { id: userId, ...ticketWhere },
          data: { twoFactorFailures: 0, ...ticketClear },
        });
        // Throws, so the recovery code is not spent for a ticket that is no longer current.
        if (claimed.count !== 1) throw new StaleTicket();
        return 'accepted';
      });
    } catch (err) {
      if (err instanceof StaleTicket) return 'stale';
      throw err;
    }
  }

  /**
   * Counts a failed check. The 8th failure locks the second factor for 15 minutes and resets the counter.
   * The lock is written with a conditional update, so only the request that sets it logs and emails.
   * Returns true when the second factor is locked after this failure.
   */
  private async recordFailure(user: Pick<User, 'id' | 'email'>, lang: MailLanguage): Promise<boolean> {
    const { twoFactorFailures } = await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorFailures: { increment: 1 } },
      select: { twoFactorFailures: true },
    });
    if (twoFactorFailures < LOCK_AFTER_FAILURES) return false;

    const until = new Date(this.now().getTime() + LOCK_MINUTES * MINUTE_MS);
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, twoFactorFailures: { gte: LOCK_AFTER_FAILURES } },
      data: { twoFactorFailures: 0, twoFactorLockedUntil: until },
    });
    if (count === 1) {
      this.logger.warn(`Two-factor sign-in locked for user ${user.id} until ${until.toISOString()} after ${LOCK_AFTER_FAILURES} failed checks`);
      this.mail.sendTwoFactorLockout(user.email, lang).catch((err: unknown) => {
        this.logger.error(`Could not send the two-factor lock notice to user ${user.id}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    return true;
  }

  /** Refuses with 429 while locked. Checked before the code is read. */
  private assertNotLocked(user: Pick<User, 'twoFactorLockedUntil'>): void {
    if (user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() > this.now().getTime()) throw this.lockedError();
  }

  private lockedError(): HttpException {
    return new HttpException(LOCKED, HttpStatus.TOO_MANY_REQUESTS);
  }

  /** True when the account's newest login ticket is `nonce`. */
  private async ticketIs(tx: Prisma.TransactionClient, userId: number, nonce: string): Promise<boolean> {
    const row = await tx.user.findUnique({ where: { id: userId }, select: { loginTicketNonce: true } });
    return row?.loginTicketNonce === nonce;
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

  private async account(userId: number): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private unixSeconds(): number {
    return Math.floor(this.now().getTime() / 1000);
  }
}
