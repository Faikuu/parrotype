import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AUTH_CLOCK } from '../src/auth/tokens';
import { hashRecoveryCode, legacyHashRecoveryCode } from '../src/auth/recovery-codes';
import { decryptSecret, deriveBoxKey, sealWith } from '../src/auth/secret-box';
import { totpAt } from '../src/auth/totp';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeAdministrator } from './e2e.helpers';
import { applyE2eEnv } from './e2e.env';

applyE2eEnv();

const MINUTE = 60_000;
const LOCKED = 'Too many incorrect codes. Try again in 15 minutes.';
const TICKET_EXPIRED = 'This sign-in has expired. Log in again.';
const WRONG_CODE = 'That code is not right. Check your authenticator app, or use a recovery code.';

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

/** Starts the app with the auth clock under test control. The clock moves only when a test says so. */
async function startApp(clock: { t: number }): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AUTH_CLOCK)
    .useValue(() => new Date(clock.t))
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

/** Registers, turns two-factor on through the API, and returns the secret and the recovery codes. */
async function enrol(app: INestApplication<App>, clock: { t: number }, name: string, email: string, password: string) {
  const server = app.getHttpServer();
  const reg = await request(server).post('/api/auth/register').send({ name, email, password }).expect(201);
  const cookie = cookieFrom(reg);
  const setup = await request(server).post('/api/auth/2fa/setup').set('Cookie', cookie).expect(200);
  const secret = setup.body.secret as string;
  const enabled = await request(server)
    .post('/api/auth/2fa/enable')
    .set('Cookie', cookie)
    .send({ code: totpAt(secret, Math.floor(clock.t / 1000)) })
    .expect(200);
  return { cookie, secret, recoveryCodes: enabled.body.recoveryCodes as string[] };
}

/** The current code, and one that is certainly wrong for it. */
const codeAt = (clock: { t: number }, secret: string) => totpAt(secret, Math.floor(clock.t / 1000));
const wrongAt = (clock: { t: number }, secret: string) => (codeAt(clock, secret) === '000000' ? '111111' : '000000');
/** Moves the clock to the next 30-second TOTP step. */
const nextStep = (clock: { t: number }) => {
  clock.t += 30_000;
};

const login = (app: INestApplication<App>, email: string, password: string) =>
  request(app.getHttpServer()).post('/api/auth/login').send({ email, password });

describe('two-factor lockout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mail: MailService;
  const clock = { t: Date.now() };
  const L = { name: 'ah_lock', email: 'ah-lock@example.com', password: 'lock-password-1' };
  let secret = '';
  let session = '';

  beforeAll(async () => {
    app = await startApp(clock);
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
    const acct = await enrol(app, clock, L.name, L.email, L.password);
    secret = acct.secret;
    // A session from before the lock, to show the password-gated operations are locked too.
    nextStep(clock);
    const first = await login(app, L.email, L.password).expect(200);
    const done = await request(app.getHttpServer())
      .post('/api/auth/2fa/verify')
      .send({ ticket: first.body.ticket, code: codeAt(clock, secret) })
      .expect(200);
    session = cookieFrom(done);
  });

  afterAll(async () => {
    await app.close();
  });

  const verify = (ticket: string, code: string) =>
    request(app.getHttpServer()).post('/api/auth/2fa/verify').send({ ticket, code });

  it('eight wrong codes lock the second factor: the eighth answers 429, and a right code is then refused too', async () => {
    nextStep(clock);
    // Two tickets, four wrong codes each: a ticket allows five attempts a minute.
    const a = await login(app, L.email, L.password).expect(200);
    for (let i = 0; i < 4; i++) {
      await verify(a.body.ticket, wrongAt(clock, secret)).expect(401);
    }
    const b = await login(app, L.email, L.password).expect(200);
    for (let i = 0; i < 3; i++) {
      await verify(b.body.ticket, wrongAt(clock, secret)).expect(401);
    }
    const eighth = await verify(b.body.ticket, wrongAt(clock, secret)).expect(429);
    expect(eighth.body.message).toBe(LOCKED);

    // Locked: the password step still answers with a ticket, and the right code is not read.
    const c = await login(app, L.email, L.password).expect(200);
    expect(c.body.twoFactorRequired).toBe(true);
    const refused = await verify(c.body.ticket, codeAt(clock, secret)).expect(429);
    expect(refused.body.message).toBe(LOCKED);

    const row = await prisma.user.findUniqueOrThrow({
      where: { nameLower: L.name },
      select: { twoFactorFailures: true, twoFactorLockedUntil: true },
    });
    expect(row.twoFactorFailures).toBe(0);
    expect(row.twoFactorLockedUntil?.getTime()).toBe(clock.t + 15 * MINUTE);
  });

  it('the lock also stops the password-gated operations (regenerating recovery codes)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/2fa/recovery-codes')
      .set('Cookie', session)
      .send({ password: L.password, code: codeAt(clock, secret) })
      .expect(429);
  });

  it('the lock is logged to the mail outbox as a notice, with no code or link in it', () => {
    const sent = mail.latestTo(L.email);
    expect(sent?.subject).toBe('Two-factor sign-in was locked on your ParroType account');
    expect(sent?.text).toContain("Someone entered your password and several wrong two-factor codes. If this wasn't you, change your password.");
    expect(sent?.text).not.toMatch(/\d{6}/);
  });

  it('after 15 minutes the lock lifts, and the counter starts again from zero', async () => {
    clock.t += 15 * MINUTE + 1_000;
    nextStep(clock);
    const ok = await login(app, L.email, L.password).expect(200);
    const done = await verify(ok.body.ticket, codeAt(clock, secret)).expect(200);
    expect(done.body.user.email).toBe(L.email);

    // One wrong code after the lift is a plain 401, not a lock.
    nextStep(clock);
    const next = await login(app, L.email, L.password).expect(200);
    await verify(next.body.ticket, wrongAt(clock, secret)).expect(401);
  });
});

describe('a success resets the failure counter (e2e)', () => {
  let app: INestApplication<App>;
  const clock = { t: Date.now() };
  const M = { name: 'ah_reset', email: 'ah-reset@example.com', password: 'reset-count-pass-1' };
  let secret = '';

  beforeAll(async () => {
    app = await startApp(clock);
    secret = (await enrol(app, clock, M.name, M.email, M.password)).secret;
  });

  afterAll(async () => {
    await app.close();
  });

  it('seven failures, a right code, then seven more failures do not lock', async () => {
    const verify = (ticket: string, code: string) =>
      request(app.getHttpServer()).post('/api/auth/2fa/verify').send({ ticket, code });

    const one = await login(app, M.email, M.password).expect(200);
    for (let i = 0; i < 5; i++) await verify(one.body.ticket, wrongAt(clock, secret)).expect(401);

    nextStep(clock);
    const two = await login(app, M.email, M.password).expect(200);
    for (let i = 0; i < 2; i++) await verify(two.body.ticket, wrongAt(clock, secret)).expect(401);
    await verify(two.body.ticket, codeAt(clock, secret)).expect(200);

    nextStep(clock);
    const three = await login(app, M.email, M.password).expect(200);
    for (let i = 0; i < 5; i++) await verify(three.body.ticket, wrongAt(clock, secret)).expect(401);
    nextStep(clock);
    const four = await login(app, M.email, M.password).expect(200);
    for (let i = 0; i < 2; i++) await verify(four.body.ticket, wrongAt(clock, secret)).expect(401);
  });
});

describe('login tickets are single use and only the newest is valid (e2e)', () => {
  let app: INestApplication<App>;
  const clock = { t: Date.now() };
  const T = { name: 'ah_ticket', email: 'ah-ticket@example.com', password: 'ticket-password-1' };
  let secret = '';

  beforeAll(async () => {
    app = await startApp(clock);
    secret = (await enrol(app, clock, T.name, T.email, T.password)).secret;
  });

  afterAll(async () => {
    await app.close();
  });

  it('an older ticket is refused after a newer login, even with the right code', async () => {
    const verify = (ticket: string, code: string) =>
      request(app.getHttpServer()).post('/api/auth/2fa/verify').send({ ticket, code });
    nextStep(clock);
    const older = await login(app, T.email, T.password).expect(200);
    const newer = await login(app, T.email, T.password).expect(200);

    const stale = await verify(older.body.ticket, codeAt(clock, secret)).expect(401);
    expect(stale.body.message).toBe(TICKET_EXPIRED);

    await verify(newer.body.ticket, codeAt(clock, secret)).expect(200);
  });

  it('a ticket that completed a sign-in is not accepted again', async () => {
    const verify = (ticket: string, code: string) =>
      request(app.getHttpServer()).post('/api/auth/2fa/verify').send({ ticket, code });
    nextStep(clock);
    const once = await login(app, T.email, T.password).expect(200);
    await verify(once.body.ticket, codeAt(clock, secret)).expect(200);
    nextStep(clock);
    const again = await verify(once.body.ticket, codeAt(clock, secret)).expect(401);
    expect(again.body.message).toBe(TICKET_EXPIRED);
  });

  it('a wrong code does not spend the ticket: the right one still works', async () => {
    const verify = (ticket: string, code: string) =>
      request(app.getHttpServer()).post('/api/auth/2fa/verify').send({ ticket, code });
    nextStep(clock);
    const t = await login(app, T.email, T.password).expect(200);
    const wrong = await verify(t.body.ticket, wrongAt(clock, secret)).expect(401);
    expect(wrong.body.message).toBe(WRONG_CODE);
    await verify(t.body.ticket, codeAt(clock, secret)).expect(200);
  });
});

describe('the last accepted TOTP step survives a restart (e2e)', () => {
  const clock = { t: Date.now() };
  const R = { name: 'ah_restart', email: 'ah-restart@example.com', password: 'restart-password-1' };

  it('a code accepted before a restart cannot be replayed after it', async () => {
    const first = await startApp(clock);
    const { secret } = await enrol(first, clock, R.name, R.email, R.password);
    nextStep(clock);
    const t1 = await login(first, R.email, R.password).expect(200);
    await request(first.getHttpServer())
      .post('/api/auth/2fa/verify')
      .send({ ticket: t1.body.ticket, code: codeAt(clock, secret) })
      .expect(200);
    await first.close();

    // A new process: its memory is empty, so only the database can refuse the replay.
    const second = await startApp(clock);
    try {
      const t2 = await login(second, R.email, R.password).expect(200);
      const replay = await request(second.getHttpServer())
        .post('/api/auth/2fa/verify')
        .send({ ticket: t2.body.ticket, code: codeAt(clock, secret) })
        .expect(401);
      expect(replay.body.message).toBe(WRONG_CODE);

      nextStep(clock);
      await request(second.getHttpServer())
        .post('/api/auth/2fa/verify')
        .send({ ticket: t2.body.ticket, code: codeAt(clock, secret) })
        .expect(200);
    } finally {
      await second.close();
    }
  });
});

describe('recovery codes and the secret encryption (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clock = { t: Date.now() };
  const V = { name: 'ah_legacy', email: 'ah-legacy@example.com', password: 'legacy-password-1' };

  beforeAll(async () => {
    app = await startApp(clock);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('new recovery codes are stored as an HMAC, not as a plain sha256', async () => {
    const { recoveryCodes } = await enrol(app, clock, V.name, V.email, V.password);
    const user = await prisma.user.findUniqueOrThrow({ where: { nameLower: V.name }, select: { id: true } });
    const stored = (await prisma.recoveryCode.findMany({ where: { userId: user.id }, select: { codeHash: true } })).map(
      (r) => r.codeHash,
    );
    expect(stored).toHaveLength(recoveryCodes.length);
    for (const code of recoveryCodes) {
      expect(stored).toContain(hashRecoveryCode(code));
      expect(stored).not.toContain(legacyHashRecoveryCode(code));
    }
  });

  it('a recovery code stored by the old plain sha256 still works, once', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { nameLower: V.name }, select: { id: true } });
    // Replace the codes with one made the old way.
    await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });
    await prisma.recoveryCode.create({ data: { userId: user.id, codeHash: legacyHashRecoveryCode('lega-cy23') } });

    nextStep(clock);
    const t1 = await login(app, V.email, V.password).expect(200);
    const done = await request(app.getHttpServer())
      .post('/api/auth/2fa/verify')
      .send({ ticket: t1.body.ticket, code: 'LEGA CY23' })
      .expect(200);
    expect(done.body.user.email).toBe(V.email);

    nextStep(clock);
    const t2 = await login(app, V.email, V.password).expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/2fa/verify')
      .send({ ticket: t2.body.ticket, code: 'lega-cy23' })
      .expect(401);
  });

  it('a secret written under the v1 (sha256) key still signs the account in, and stays v1 until two-factor is set up again', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { nameLower: V.name }, select: { id: true, totpSecret: true } });
    const secret = decryptSecret(user.totpSecret!);
    const legacy = sealWith(deriveBoxKey(process.env.TOTP_ENCRYPTION_KEY!, 'v1'), secret, 'v1');
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: legacy } });

    nextStep(clock);
    const t = await login(app, V.email, V.password).expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/2fa/verify')
      .send({ ticket: t.body.ticket, code: codeAt(clock, secret) })
      .expect(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpSecret: true } });
    expect(after.totpSecret?.startsWith('v1:')).toBe(true);
  });
});

describe('password reset and email verification throttles (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await startApp({ t: Date.now() });
  });

  afterAll(async () => {
    await app.close();
  });

  it('a reset is limited to ten attempts in 15 minutes per client address', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      await request(server).post('/api/auth/password/reset').send({ token: `bogus-${i}`, newPassword: 'valid-new-password-1' }).expect(400);
    }
    await request(server).post('/api/auth/password/reset').send({ token: 'bogus-11', newPassword: 'valid-new-password-1' }).expect(429);
  });

  it('a verification is limited to twenty attempts in 15 minutes per client address', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 20; i++) {
      await request(server).post('/api/auth/email/verify').send({ token: `bogus-${i}` }).expect(400);
    }
    await request(server).post('/api/auth/email/verify').send({ token: 'bogus-21' }).expect(429);
  });
});

describe('forgot-password timing (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await startApp({ t: Date.now() });
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'ah_known', email: 'ah-known@example.com', password: 'known-password-1' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a known and an unknown address both take at least 400 ms, and both answer { ok: true }', async () => {
    const server = app.getHttpServer();
    const timed = async (email: string) => {
      const started = Date.now();
      await request(server).post('/api/auth/password/forgot').send({ email }).expect(200, { ok: true });
      return Date.now() - started;
    };
    const known: number[] = [];
    const unknown: number[] = [];
    // Two of each: the forgot route allows five requests per client address in 15 minutes.
    for (let i = 0; i < 2; i++) {
      unknown.push(await timed('ah-nobody@example.com'));
      known.push(await timed('ah-known@example.com'));
    }
    for (const ms of [...known, ...unknown]) expect(ms).toBeGreaterThanOrEqual(400);
  });
});

describe('stale unverified accounts can be taken over at registration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clock = { t: Date.now() };
  const HOURS = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  beforeAll(async () => {
    app = await startApp(clock);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeUser(name: string, email: string, createdAt: Date, extra: { verified?: boolean } = {}) {
    return prisma.user.create({
      data: {
        name,
        nameLower: name.toLowerCase(),
        email,
        passwordHash: 'not-a-real-hash',
        createdAt,
        emailVerifiedAt: extra.verified ? new Date() : null,
      },
      select: { id: true },
    });
  }

  it('a 73-hour-old unverified account with no results or groups is deleted, and its name and email go to the new registration', async () => {
    const old = await makeUser('ah_squat', 'ah-squat@example.com', HOURS(73));
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'AH_Squat', email: 'ah-squat@example.com', password: 'squat-password-1' })
      .expect(201);
    expect(reg.body.user).toMatchObject({ name: 'AH_Squat', email: 'ah-squat@example.com' });
    expect(await prisma.user.findUnique({ where: { id: old.id } })).toBeNull();
  });

  it('a 71-hour-old unverified account is not taken over', async () => {
    await makeUser('ah_fresh', 'ah-fresh@example.com', HOURS(71));
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'ah_fresh', email: 'ah-other@example.com', password: 'fresh-password-1' })
      .expect(409);
  });

  it('an old account with a result, one in a group, or a verified email is not taken over', async () => {
    const withResult = await makeUser('ah_result', 'ah-result@example.com', HOURS(200));
    await prisma.result.create({
      data: {
        userId: withResult.id, mode: 'time', mode2: '15', language: 'en', wpm: 50, rawWpm: 55, accuracy: 98,
        consistency: 90, durationMs: 15_000, correctChars: 100, incorrectChars: 2, extraChars: 0, missedChars: 0,
        punctuation: false, numbers: false,
      },
    });
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'ah_result', email: 'ah-r2@example.com', password: 'result-password-1' })
      .expect(409);

    const inGroup = await makeUser('ah_group', 'ah-group@example.com', HOURS(200));
    await makeAdministrator(prisma, 'ah_group');
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'ah_group', email: 'ah-g2@example.com', password: 'group-password-1' })
      .expect(409);
    expect(await prisma.user.findUnique({ where: { id: inGroup.id } })).not.toBeNull();

    await makeUser('ah_verified', 'ah-verified@example.com', HOURS(200), { verified: true });
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'ah_verified', email: 'ah-v2@example.com', password: 'verified-password-1' })
      .expect(409);
  });
});
