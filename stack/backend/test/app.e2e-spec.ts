import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyE2eEnv } from './e2e.env';

// Config is read lazily (getEnv), so setting it here, before the app is built, is enough.
applyE2eEnv();

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

describe('ParroType API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('register, me, submit, summary, logout, then me is 401', async () => {
    const server = app.getHttpServer();
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ name: 'e2e_typist', email: 'E2E@example.com', password: 'a-good-password' })
      .expect(201);
    expect(reg.body.user).toMatchObject({ name: 'e2e_typist', email: 'e2e@example.com' });
    expect(reg.body.user).not.toHaveProperty('passwordHash');
    const cookie = cookieFrom(reg);
    expect(cookie).toMatch(/^pt_session=/);

    const me = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.user.name).toBe('e2e_typist');

    await request(server)
      .post('/api/results')
      .set('Cookie', cookie)
      .send({
        mode: 'time',
        mode2: '60',
        language: 'en',
        wpm: 80,
        rawWpm: 85,
        accuracy: 97.5,
        consistency: 90,
        durationMs: 60_000,
        charStats: { correct: 400, incorrect: 10, extra: 0, missed: 0 },
        punctuation: false,
        numbers: false,
      })
      .expect(201);

    const summary = await request(server).get('/api/results/me/summary').set('Cookie', cookie).expect(200);
    expect(summary.body).toMatchObject({ totalTests: 1, totalTimeMs: 60_000, averageWpm: 80 });

    await request(server).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    await request(server).get('/api/auth/me').expect(401);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const server = app.getHttpServer();
    const wrong = await request(server)
      .post('/api/auth/login')
      .send({ email: 'e2e@example.com', password: 'not-the-password' })
      .expect(401);
    const unknown = await request(server)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-the-password' })
      .expect(401);
    expect(wrong.body.message).toBe('Invalid email or password');
    expect(unknown.body.message).toBe('Invalid email or password');
  });

  it('rejects a tampered session cookie', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'e2e@example.com', password: 'a-good-password' })
      .expect(200);
    const token = cookieFrom(login).slice('pt_session='.length);
    const [header, payload, sig] = token.split('.');
    const forged = `${header}.${payload.slice(0, -2)}AA.${sig}`;
    await request(server).get('/api/auth/me').set('Cookie', `pt_session=${forged}`).expect(401);
  });

  it('returns 400 with a field-level message array for invalid input', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'x', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(Array.isArray(res.body.message)).toBe(true);
    expect(res.body.message.some((m: string) => m.startsWith('name:'))).toBe(true);
    expect(res.body.message.some((m: string) => m.startsWith('email:'))).toBe(true);
  });

  it('serves a random quote and rejects zen on the leaderboard', async () => {
    const server = app.getHttpServer();
    // The e2e database starts empty, so add one short English quote.
    const text = 'Imitation is suicide.';
    await app.get(PrismaService).quote.create({
      data: { language: 'en', text, source: 'Ralph Waldo Emerson, Self-Reliance (1841)', length: text.length },
    });

    const quote = await request(server).get('/api/quotes/random?language=en&length=short').expect(200);
    expect(quote.body).toMatchObject({ language: 'en', text });
    expect(quote.body.length).toBeLessThan(100);

    // No Polish quotes were seeded, so this bucket is empty.
    await request(server).get('/api/quotes/random?language=pl&length=long').expect(404);

    await request(server).get('/api/leaderboard?mode=zen&mode2=x&language=en').expect(400);
  });
});
