import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getEnv } from '../config/env';
import type { MailLanguage } from './locale';
import { renderResetMail, renderVerifyMail } from './templates';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SentMail extends MailMessage {
  sentAt: string;
}

/** How many messages the console transport keeps in memory (for tests and local development). */
export const MAIL_OUTBOX_SIZE = 50;

/**
 * Sends the account emails. MAIL_TRANSPORT=console logs them and keeps the last 50 in memory;
 * MAIL_TRANSPORT=smtp sends them through SMTP_URL. Callers decide what a failed send means: the
 * password and verification flows log it and still answer the request.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly outbox: SentMail[] = [];
  private transporter: Transporter | null = null;

  constructor() {
    const env = getEnv();
    if (env.MAIL_TRANSPORT === 'console' && env.NODE_ENV === 'production') {
      this.logger.warn('MAIL_TRANSPORT=console in production: account emails (and their links) go to the log, not to users.');
    }
  }

  /** The reset link email. `link` is the full URL the user opens. */
  sendPasswordReset(to: string, lang: MailLanguage, token: string): Promise<void> {
    const { subject, text } = renderResetMail(lang, `${getEnv().APP_URL}/reset-password?token=${token}`);
    return this.send({ to, subject, text });
  }

  sendVerification(to: string, lang: MailLanguage, token: string): Promise<void> {
    const { subject, text } = renderVerifyMail(lang, `${getEnv().APP_URL}/verify-email?token=${token}`);
    return this.send({ to, subject, text });
  }

  /**
   * Sends one message. The console transport records it before the first await, so a caller that
   * does not await the promise still finds it in the outbox straight away.
   */
  async send(message: MailMessage): Promise<void> {
    const env = getEnv();
    if (env.MAIL_TRANSPORT === 'console') {
      this.record(message);
      if (env.NODE_ENV === 'test') {
        this.logger.debug(`[mail] to=${message.to} subject="${message.subject}"`);
      } else {
        this.logger.log(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
      }
      return;
    }
    await this.smtp().sendMail({ from: env.MAIL_FROM, to: message.to, subject: message.subject, text: message.text });
  }

  /** The console outbox, oldest first. Empty when MAIL_TRANSPORT=smtp is in use. */
  messages(): readonly SentMail[] {
    return [...this.outbox];
  }

  /** The newest message sent to `to` (case-insensitive), if any. */
  latestTo(to: string): SentMail | undefined {
    const wanted = to.toLowerCase();
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      if (this.outbox[i].to.toLowerCase() === wanted) return this.outbox[i];
    }
    return undefined;
  }

  private record(message: MailMessage): void {
    this.outbox.push({ ...message, sentAt: new Date().toISOString() });
    if (this.outbox.length > MAIL_OUTBOX_SIZE) this.outbox.splice(0, this.outbox.length - MAIL_OUTBOX_SIZE);
  }

  private smtp(): Transporter {
    this.transporter ??= nodemailer.createTransport(getEnv().SMTP_URL ?? undefined);
    return this.transporter;
  }
}
