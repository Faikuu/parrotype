import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { MailLanguage } from '../mail/locale';
import { AUTH_CLOCK, HOUR_MS, VERIFY_PER_ACCOUNT_PER_HOUR, VERIFY_TOKEN_HOURS, randomToken, sha256Hex, type Clock } from './tokens';

export const INVALID_VERIFICATION = 'This verification link is invalid or has expired';
export const VERIFY_LIMIT = 'Too many verification emails. Try again later.';

/** Email verification. Verified accounts appear on the leaderboards; nothing else depends on it. */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(AUTH_CLOCK) private readonly now: Clock,
  ) {}

  /**
   * Called by registration. A failed send is logged and never fails the registration: the user can
   * ask for another email from the account page.
   */
  async sendOnRegister(userId: number, email: string, lang: MailLanguage): Promise<void> {
    try {
      await this.issue(userId, email, lang);
    } catch (err) {
      this.logger.error(`Could not send the verification email for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Authenticated resend. Three emails per account per hour; a verified account gets nothing. */
  async resend(userId: number, lang: MailLanguage): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.emailVerifiedAt) return;

    const recent = await this.prisma.authToken.count({
      where: { userId, purpose: 'verify', createdAt: { gte: new Date(this.now().getTime() - HOUR_MS) } },
    });
    if (recent >= VERIFY_PER_ACCOUNT_PER_HOUR) throw new HttpException(VERIFY_LIMIT, HttpStatus.TOO_MANY_REQUESTS);

    try {
      await this.issue(userId, user.email, lang);
    } catch (err) {
      this.logger.error(`Could not resend the verification email for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException('The email could not be sent. Try again in a few minutes.');
    }
  }

  /** Marks the account's email as verified. Idempotent for an already verified account. */
  async verify(token: string): Promise<void> {
    const tokenHash = sha256Hex(token);
    const now = this.now();
    await this.prisma.writeTx(async (tx) => {
      const row = await tx.authToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, purpose: true, usedAt: true, expiresAt: true },
      });
      if (!row || row.purpose !== 'verify' || row.usedAt !== null || row.expiresAt.getTime() <= now.getTime()) {
        throw new BadRequestException(INVALID_VERIFICATION);
      }
      const claimed = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
      if (claimed.count === 0) throw new BadRequestException(INVALID_VERIFICATION);
      await tx.user.updateMany({ where: { id: row.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
    });
  }

  private async issue(userId: number, email: string, lang: MailLanguage): Promise<void> {
    const now = this.now();
    const token = randomToken();
    await this.prisma.authToken.create({
      data: {
        userId,
        purpose: 'verify',
        tokenHash: sha256Hex(token),
        expiresAt: new Date(now.getTime() + VERIFY_TOKEN_HOURS * HOUR_MS),
      },
    });
    await this.mail.sendVerification(email, lang, token);
  }
}
