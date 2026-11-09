import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MAIL_OUTBOX_SIZE, MailService } from './mail.service';

let mockEnv: Record<string, unknown> = {};
jest.mock('../config/env', () => ({ getEnv: () => mockEnv }));

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail })) }));

const consoleEnv = {
  MAIL_TRANSPORT: 'console',
  SMTP_URL: null,
  MAIL_FROM: 'ParroType <no-reply@localhost>',
  APP_URL: 'https://parrotype.example.com',
  NODE_ENV: 'test',
};

describe('MailService', () => {
  beforeEach(() => {
    mockEnv = { ...consoleEnv };
    sendMail.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('console transport: records the message synchronously, so it is in the outbox before the caller awaits', () => {
    const mail = new MailService();
    void mail.sendPasswordReset('a@example.com', 'en', 'tok123');
    expect(mail.latestTo('A@example.com')).toMatchObject({
      to: 'a@example.com',
      subject: 'Reset your ParroType password',
    });
    expect(mail.latestTo('a@example.com')!.text).toContain('https://parrotype.example.com/reset-password?token=tok123');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('console transport: keeps only the last 50 messages', async () => {
    const mail = new MailService();
    for (let i = 0; i < MAIL_OUTBOX_SIZE + 5; i++) {
      await mail.send({ to: `user${i}@example.com`, subject: 's', text: 't' });
    }
    const kept = mail.messages();
    expect(kept).toHaveLength(MAIL_OUTBOX_SIZE);
    expect(kept[0].to).toBe('user5@example.com');
    expect(kept[kept.length - 1].to).toBe(`user${MAIL_OUTBOX_SIZE + 4}@example.com`);
  });

  it('smtp transport: creates the transport from SMTP_URL and sends with MAIL_FROM', async () => {
    mockEnv = { ...consoleEnv, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtps://user:pw@mail.example.com:465' };
    sendMail.mockResolvedValue({ messageId: 'x' });
    const mail = new MailService();

    await mail.sendVerification('b@example.com', 'de', 'verify-token');

    expect(nodemailer.createTransport).toHaveBeenCalledWith('smtps://user:pw@mail.example.com:465');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'ParroType <no-reply@localhost>',
        to: 'b@example.com',
        subject: 'Bestätige deine E-Mail-Adresse bei ParroType',
        text: expect.stringContaining('https://parrotype.example.com/verify-email?token=verify-token'),
      }),
    );
    // The outbox is for the console transport only.
    expect(mail.messages()).toHaveLength(0);
  });

  it('smtp transport: a failed send rejects, so the caller can log it', async () => {
    mockEnv = { ...consoleEnv, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://mail.example.com' };
    sendMail.mockRejectedValue(new Error('connection refused'));
    const mail = new MailService();
    await expect(mail.sendPasswordReset('c@example.com', 'en', 't')).rejects.toThrow('connection refused');
  });
});
