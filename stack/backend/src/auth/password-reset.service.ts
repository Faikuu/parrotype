import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { MailLanguage } from '../mail/locale';
import { AUTH_CLOCK, HOUR_MS, RESET_PER_EMAIL_PER_HOUR, RESET_TOKEN_MINUTES, randomToken, sha256Hex, type Clock } from './tokens';

export const BCRYPT_ROUNDS = 12;
export const INVALID_RESET = 'This reset link is invalid or has expired';
/** A placeholder user id that matches no row, used so the unknown-email path runs the same queries. */
const NO_USER_ID = 0;

/**
 * Password reset by emailed link. The raw token is only ever emailed: the database holds its sha256.
 * forgot() always answers the same way, so it never says whether an account exists.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(AUTH_CLOCK) private readonly now: Clock,
  ) {}

  /**
   * Creates a reset token and emails the link when the email belongs to a live account and the
   * per-email limit allows it. Returns nothing: the controller answers { ok: true } either way.
   *
   * Every call runs the same steps: the lookup, the count, one write and one create. For an unknown or
   * suspended email, or one over its limit, those run against the placeholder id, which matches no row.
   */
  async forgot(email: string, lang: MailLanguage): Promise<void> {
    const now = this.now();
    const since = new Date(now.getTime() - HOUR_MS);
    const token = randomToken();
    const tokenHash = sha256Hex(token);

    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, bannedAt: true } });
    const live = user !== null && !user.bannedAt;
    const recent = await this.prisma.authToken.count({
      where: { userId: live ? user.id : NO_USER_ID, purpose: 'reset', createdAt: { gte: since } },
    });
    const send = live && recent < RESET_PER_EMAIL_PER_HOUR;
    const userId = send ? user.id : NO_USER_ID;

    const expiresAt = new Date(now.getTime() + RESET_TOKEN_MINUTES * 60_000);
    await this.prisma.writeTx(async (tx) => {
      // A new link replaces any earlier unused one. Matches nothing when no link is sent.
      await tx.authToken.updateMany({ where: { userId, purpose: 'reset', usedAt: null }, data: { usedAt: now } });
      if (send) await tx.authToken.create({ data: { userId, purpose: 'reset', tokenHash, expiresAt } });
    });
    if (!send) return;
    // Not awaited: the answer must not wait on SMTP, and a failed send is only logged.
    this.mail.sendPasswordReset(email, lang, token).catch((err: unknown) => {
      this.logger.error(`Could not send the password reset email: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * Sets a new password with a valid, unused, unexpired reset token. Bumps tokenVersion, so every
   * session ends, and does not sign the caller in. The token and any other reset token are used up.
   *
   * The link is checked before the password is hashed, so a bad or expired link costs one read and no
   * bcrypt work. The claim repeats the checks in its conditional write, so two requests with the same link
   * cannot both win.
   */
  async reset(token: string, newPassword: string): Promise<void> {
    const tokenHash = sha256Hex(token);
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        purpose: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { bannedAt: true } },
      },
    });
    if (!row || row.purpose !== 'reset' || row.usedAt !== null || row.expiresAt.getTime() <= this.now().getTime()) {
      throw new BadRequestException(INVALID_RESET);
    }
    if (row.user.bannedAt) throw new BadRequestException(INVALID_RESET);

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = this.now();
    await this.prisma.writeTx(async (tx) => {
      const claimed = await tx.authToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw new BadRequestException(INVALID_RESET);

      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.authToken.updateMany({
        where: { userId: row.userId, purpose: 'reset', usedAt: null },
        data: { usedAt: now },
      });
    });
  }
}
