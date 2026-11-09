import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getEnv } from '../config/env';
import type { MailLanguage } from './locale';
import { renderLockoutMail, renderResetMail, renderVerifyMail } from './templates';

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
 * Sends the account emails. MAIL_TRANSPORT=console keeps the last 50 in memory and logs each message;
 * MAIL_TRANSPORT=smtp sends them through SMTP_URL. Callers decide what a failed send means: the
 * password and verification flows log it and still answer the request.
 *
 * The console transport is for development and tests. In production it delivers nothing, and its log
 * line carries no body, so the links (reset and verification tokens) never reach the log.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly outbox: SentMail[] = [];
  private transporter: Transporter | null = null;

  constructor() {
    const env = getEnv();
    if (env.MAIL_TRANSPORT === 'console' && env.NODE_ENV === 'production') {
      this.logger.warn('MAIL_TRANSPORT=console in production: account emails are not delivered. Set MAIL_TRANSPORT=smtp.');
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

  /** The notice that two-factor sign-in locked after repeated wrong codes. */
  sendTwoFactorLockout(to: string, lang: MailLanguage): Promise<void> {
    const { subject, text } = renderLockoutMail(lang);
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
      this.logLine(message, env.NODE_ENV);
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

  /**
   * The log line for a console message. Production gets the recipient and subject and no body, because the
   * body carries the one-time links. Development gets the body. Tests get a debug line only.
   */
  private logLine(message: MailMessage, nodeEnv: string): void {
    const head = `[mail] to=${message.to} subject="${message.subject}"`;
    if (nodeEnv === 'test') {
      this.logger.debug(head);
    } else if (nodeEnv === 'production') {
      this.logger.log(`${head}. Mail is not delivered with MAIL_TRANSPORT=console. Set MAIL_TRANSPORT=smtp.`);
    } else {
      this.logger.log(`${head}\n${message.text}`);
    }
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
