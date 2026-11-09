import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AUTH_CLOCK } from '../src/auth/tokens';
import { totpAt } from '../src/auth/totp';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeAdministrator, sessionFor } from './e2e.helpers';
import { applyE2eEnv } from './e2e.env';

applyE2eEnv();

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

/** The token in a link of an email, e.g. ...?token=abc. */
const tokenIn = (text: string): string => {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) throw new Error('no token in the email');
  return match[1];
};

const MINUTE = 60_000;
const RECOVERY = /^[a-z2-7]{4}-[a-z2-7]{4}$/;
const INVALID_RESET = 'This reset link is invalid or has expired';
const INVALID_VERIFY = 'This verification link is invalid or has expired';

/** Starts the app with the auth clock under test control. The clock moves only when a test says so. */
async function startApp(clock: { t: number }) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AUTH_CLOCK)
    .useValue(() => new Date(clock.t))
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

// Each describe block runs its own app, so the in-memory throttlers start fresh for each.

describe('password reset and email verification (e2e)', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  const clock = { t: Date.now() };

  beforeAll(async () => {
    app = await startApp(clock);
    mail = app.get(MailService);
  });

  afterAll(async () => {
    await app.close();
  });

  const A = { name: 'mf_reset', email: 'mf-reset@example.com', password: 'old-password-1' };
  let cookieA = '';

  it('registration sends a verification email, and the account starts unverified', async () => {
    const server = app.getHttpServer();
    const reg = await request(server).post('/api/auth/register').send(A).expect(201);
    cookieA = cookieFrom(reg);
    expect(reg.body.user).toMatchObject({ emailVerified: false, twoFactorEnabled: false });

    const sent = mail.latestTo(A.email);
    expect(sent?.subject).toBe('Verify your ParroType email');
    expect(sent?.text).toContain('http://localhost:5173/verify-email?token=');

    const me = await request(server).get('/api/auth/me').set('Cookie', cookieA).expect(200);
    expect(me.body.user).toMatchObject({ emailVerified: false, twoFactorEnabled: false });
  });

  it('a failed verification email does not fail the registration', async () => {
    const server = app.getHttpServer();
    const send = jest.spyOn(mail, 'send').mockRejectedValueOnce(new Error('smtp is down'));
    try {
      await request(server)
        .post('/api/auth/register')
        .send({ name: 'mf_nomail', email: 'mf-nomail@example.com', password: 'nomail-password-1' })
        .expect(201);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
    }
  });

  it('verifies the email from the link; the link works once', async () => {
    const server = app.getHttpServer();
    const token = tokenIn(mail.latestTo(A.email)!.text);

    await request(server).post('/api/auth/email/verify').send({ token }).expect(200, { ok: true });
    const me = await request(server).get('/api/auth/me').set('Cookie', cookieA).expect(200);
    expect(me.body.user.emailVerified).toBe(true);

    const again = await request(server).post('/api/auth/email/verify').send({ token }).expect(400);
    expect(again.body.message).toBe(INVALID_VERIFY);
    await request(server).post('/api/auth/email/verify').send({ token: 'not-a-token' }).expect(400);
  });

  it('resend needs a session and is limited to three emails an hour', async () => {
    const server = app.getHttpServer();
    const B = { name: 'mf_verify', email: 'mf-verify@example.com', password: 'verify-password-1' };
    const reg = await request(server).post('/api/auth/register').send(B).expect(201);
    const cookieB = cookieFrom(reg);

    await request(server).post('/api/auth/email/resend').expect(401);
    // The registration email counts as the first of the three.
    await request(server).post('/api/auth/email/resend').set('Cookie', cookieB).expect(200, { ok: true });
    await request(server).post('/api/auth/email/resend').set('Cookie', cookieB).expect(200, { ok: true });
    const third = await request(server).post('/api/auth/email/resend').set('Cookie', cookieB).expect(429);
    expect(third.body.message).toBe('Too many verification emails. Try again later.');

    expect(mail.messages().filter((m) => m.to === B.email)).toHaveLength(3);
  });

  it('writes the email in the language of Accept-Language', async () => {
    const server = app.getHttpServer();
    const C = { name: 'mf_lang', email: 'mf-lang@example.com', password: 'lang-password-1' };
    await request(server).post('/api/auth/register').set('Accept-Language', 'pl-PL,pl;q=0.9,en;q=0.5').send(C).expect(201);
    expect(mail.latestTo(C.email)?.subject).toBe('Potwierdź adres e-mail w ParroType');
  });

  it('forgot for an unknown email answers 200 and sends nothing', async () => {
    const server = app.getHttpServer();
    const before = mail.messages().length;
    await request(server).post('/api/auth/password/forgot').send({ email: 'nobody@example.com' }).expect(200, { ok: true });
    expect(mail.messages().length).toBe(before);
    expect(mail.latestTo('nobody@example.com')).toBeUndefined();
  });

  it('a reset link changes the password, ends the old sessions, and does not sign in', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/auth/password/forgot').send({ email: A.email }).expect(200, { ok: true });
    const sent = mail.latestTo(A.email)!;
    expect(sent.subject).toBe('Reset your ParroType password');
    const token = tokenIn(sent.text);

    await request(server)
      .post('/api/auth/password/reset')
      .send({ token, newPassword: 'new-password-2' })
      .expect(200, { ok: true });

    // The session from before the reset is gone, and the reset does not set a cookie.
    await request(server).get('/api/auth/me').set('Cookie', cookieA).expect(401);
    await request(server).post('/api/auth/login').send({ email: A.email, password: A.password }).expect(401);
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: A.email, password: 'new-password-2' })
      .expect(200);
    expect(login.body.user.email).toBe(A.email);

    // The link works once.
    const again = await request(server).post('/api/auth/password/reset').send({ token, newPassword: 'third-password-3' }).expect(400);
    expect(again.body.message).toBe(INVALID_RESET);
  });

  it('an expired reset link is refused', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/auth/password/forgot').send({ email: A.email }).expect(200);
    const token = tokenIn(mail.latestTo(A.email)!.text);

    clock.t += 31 * MINUTE;
    const res = await request(server).post('/api/auth/password/reset').send({ token, newPassword: 'late-password-4' }).expect(400);
    expect(res.body.message).toBe(INVALID_RESET);
  });

  it('forgot is limited to five requests per client address in 15 minutes', async () => {
    const server = app.getHttpServer();
    // Three requests so far in this app (the unknown email and two known ones). Two more pass; the sixth is refused.
    for (let i = 0; i < 2; i++) {
      await request(server).post('/api/auth/password/forgot').send({ email: A.email }).expect(200);
    }
    await request(server).post('/api/auth/password/forgot').send({ email: A.email }).expect(429);
  });
});

describe('two-factor sign-in (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clock = { t: Date.now() };

  beforeAll(async () => {
    app = await startApp(clock);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const T = { name: 'mf_twofa', email: 'mf-twofa@example.com', password: 'twofa-password-1' };
  let cookieT = '';
  let secret = '';
  let recoveryCodes: string[] = [];

  /** The current code, and one that is certainly wrong for it. */
  const codeNow = () => totpAt(secret, Math.floor(clock.t / 1000));
  const wrongNow = () => (codeNow() === '000000' ? '111111' : '000000');
  /** Moves the clock to the next 30-second step. */
  const nextStep = () => {
    clock.t += 30_000;
  };

  const login = (password = T.password) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email: T.email, password });

  it('setup, a wrong code, then the right code turns it on and returns ten recovery codes', async () => {
    const server = app.getHttpServer();
    const reg = await request(server).post('/api/auth/register').send(T).expect(201);
    cookieT = cookieFrom(reg);

    await request(server).post('/api/auth/2fa/setup').expect(401);
    const setup = await request(server).post('/api/auth/2fa/setup').set('Cookie', cookieT).expect(200);
    secret = setup.body.secret;
    expect(secret).toMatch(/^[a-z2-7]{32}$/);
    expect(setup.body.otpauthUrl).toContain(`secret=${secret}`);
    expect(setup.body.otpauthUrl.startsWith('otpauth://totp/')).toBe(true);

    await request(server).post('/api/auth/2fa/enable').set('Cookie', cookieT).send({ code: wrongNow() }).expect(400);

    const enabled = await request(server)
      .post('/api/auth/2fa/enable')
      .set('Cookie', cookieT)
      .send({ code: codeNow() })
      .expect(200);
    recoveryCodes = enabled.body.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    for (const code of recoveryCodes) expect(code).toMatch(RECOVERY);

    const me = await request(server).get('/api/auth/me').set('Cookie', cookieT).expect(200);
    expect(me.body.user.twoFactorEnabled).toBe(true);

    // Two-factor is already on: setting it up again is refused.
    await request(server).post('/api/auth/2fa/setup').set('Cookie', cookieT).expect(409);
  });

  let sessionCookie = '';

  it('login with two-factor on returns a ticket and no session, then the code completes it', async () => {
    const server = app.getHttpServer();
    nextStep();
    const res = await login().expect(200);
    expect(res.body).toEqual({ twoFactorRequired: true, ticket: expect.any(String) });
    expect(res.body.user).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();

    await request(server).post('/api/auth/2fa/verify').send({ ticket: res.body.ticket, code: wrongNow() }).expect(401);
    const done = await request(server)
      .post('/api/auth/2fa/verify')
      .send({ ticket: res.body.ticket, code: codeNow() })
      .expect(200);
    expect(done.body.user).toMatchObject({ email: T.email, twoFactorEnabled: true });
    sessionCookie = cookieFrom(done);
    await request(server).get('/api/auth/me').set('Cookie', sessionCookie).expect(200);
  });

  it('a TOTP code cannot be used twice: a replay within its window is refused', async () => {
    const server = app.getHttpServer();
    const usedCode = codeNow();
    const first = await login().expect(200);
    // The same code, at the same step as the one accepted above.
    await request(server).post('/api/auth/2fa/verify').send({ ticket: first.body.ticket, code: usedCode }).expect(401);

    nextStep();
    await request(server)
      .post('/api/auth/2fa/verify')
      .send({ ticket: first.body.ticket, code: codeNow() })
      .expect(200);
  });

  it('a ticket is not a session cookie, and a session cookie is not a ticket', async () => {
    const server = app.getHttpServer();
    nextStep();
    const res = await login().expect(200);
    const ticket = res.body.ticket as string;

    // The ticket in the session cookie slot is refused.
    await request(server).get('/api/auth/me').set('Cookie', `pt_session=${ticket}`).expect(401);
    // And a session token is refused as a ticket.
    const sessionToken = sessionCookie.split('=')[1];
    await request(server).post('/api/auth/2fa/verify').send({ ticket: sessionToken, code: '123456' }).expect(401);
  });

  it('a recovery code works once, in any letter case', async () => {
    const server = app.getHttpServer();
    nextStep();
    const first = await login().expect(200);
    const done = await request(server)
      .post('/api/auth/2fa/verify')
      .send({ ticket: first.body.ticket, code: recoveryCodes[0].toUpperCase() })
      .expect(200);
    expect(done.body.user.email).toBe(T.email);

    const second = await login().expect(200);
    await request(server)
      .post('/api/auth/2fa/verify')
      .send({ ticket: second.body.ticket, code: recoveryCodes[0] })
      .expect(401);
  });

  it('five wrong codes use up a ticket for the minute', async () => {
    const server = app.getHttpServer();
    const res = await login().expect(200);
    const ticket = res.body.ticket as string;
    for (let i = 0; i < 5; i++) {
      await request(server).post('/api/auth/2fa/verify').send({ ticket, code: '000001' }).expect(401);
    }
    const blocked = await request(server).post('/api/auth/2fa/verify').send({ ticket, code: codeNow() }).expect(429);
    expect(blocked.body.message).toBe('Too many attempts. Log in again.');
  });

  it('regenerating the recovery codes replaces the old set', async () => {
    const server = app.getHttpServer();
    nextStep();
    await request(server)
      .post('/api/auth/2fa/recovery-codes')
      .set('Cookie', sessionCookie)
      .send({ password: 'wrong-password-x', code: codeNow() })
      .expect(401);

    const fresh = await request(server)
      .post('/api/auth/2fa/recovery-codes')
      .set('Cookie', sessionCookie)
      .send({ password: T.password, code: codeNow() })
      .expect(200);
    const newCodes: string[] = fresh.body.recoveryCodes;
    expect(newCodes).toHaveLength(10);
    expect(newCodes).not.toEqual(expect.arrayContaining([recoveryCodes[5]]));

    const old = await login().expect(200);
    await request(server).post('/api/auth/2fa/verify').send({ ticket: old.body.ticket, code: recoveryCodes[5] }).expect(401);
    const current = await login().expect(200);
    await request(server).post('/api/auth/2fa/verify').send({ ticket: current.body.ticket, code: newCodes[0] }).expect(200);
    recoveryCodes = newCodes;
  });

  it('disable needs the password and a code, and ends the old session', async () => {
    const server = app.getHttpServer();
    nextStep();
    await request(server)
      .post('/api/auth/2fa/disable')
      .set('Cookie', sessionCookie)
      .send({ password: 'wrong-password-x', code: codeNow() })
      .expect(401);
    await request(server)
      .post('/api/auth/2fa/disable')
      .set('Cookie', sessionCookie)
      .send({ password: T.password, code: wrongNow() })
      .expect(400);

    const off = await request(server)
      .post('/api/auth/2fa/disable')
      .set('Cookie', sessionCookie)
      .send({ password: T.password, code: codeNow() })
      .expect(200);
    cookieT = cookieFrom(off);

    await request(server).get('/api/auth/me').set('Cookie', sessionCookie).expect(401);
    const me = await request(server).get('/api/auth/me').set('Cookie', cookieT).expect(200);
    expect(me.body.user.twoFactorEnabled).toBe(false);

    // Back to the password alone.
    const res = await login().expect(200);
    expect(res.body.user.email).toBe(T.email);
    expect(res.body.twoFactorRequired).toBeUndefined();
  });

  it('an admin reset needs users.security, clears the second factor and the codes, ends the sessions, and is audited', async () => {
    const server = app.getHttpServer();
    // Turn it on again, so there is something to reset.
    const setup = await request(server).post('/api/auth/2fa/setup').set('Cookie', cookieT).expect(200);
    secret = setup.body.secret;
    nextStep();
    const enabled = await request(server).post('/api/auth/2fa/enable').set('Cookie', cookieT).send({ code: codeNow() }).expect(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);

    const target = await prisma.user.findUniqueOrThrow({ where: { nameLower: T.name }, select: { id: true } });
    expect(await prisma.recoveryCode.count({ where: { userId: target.id } })).toBe(10);

    // A plain account lacks users.security.
    const plain = await request(server)
      .post('/api/auth/register')
      .send({ name: 'mf_plain', email: 'mf-plain@example.com', password: 'plain-password-1' })
      .expect(201);
    await request(server)
      .post(`/api/admin/users/${target.id}/2fa/reset`)
      .set('Cookie', cookieFrom(plain))
      .expect(403);

    await request(server)
      .post('/api/auth/register')
      .send({ name: 'mf_admin', email: 'mf-admin@example.com', password: 'admin-password-1' })
      .expect(201);
    await makeAdministrator(prisma, 'mf_admin');
    const admin = await sessionFor(app, prisma, 'mf_admin');

    await request(server).post(`/api/admin/users/${target.id}/2fa/reset`).set('Cookie', admin).expect(200, { ok: true });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { totpSecret: true, totpEnabledAt: true } });
    expect(row).toEqual({ totpSecret: null, totpEnabledAt: null });
    expect(await prisma.recoveryCode.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.adminAction.count({ where: { action: 'user_2fa_reset', target: `user:${target.id}` } })).toBe(1);

    // Their session is gone, and a second reset has nothing to clear.
    await request(server).get('/api/auth/me').set('Cookie', cookieT).expect(401);
    await request(server).post(`/api/admin/users/${target.id}/2fa/reset`).set('Cookie', admin).expect(409);

    const back = await login().expect(200);
    expect(back.body.user.email).toBe(T.email);
  });
});
