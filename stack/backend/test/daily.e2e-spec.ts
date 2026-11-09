import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { utcDate } from '../src/common/dates';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyE2eEnv } from './e2e.env';
import { verifyEmail } from './e2e.helpers';

applyE2eEnv();

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

const result = (mode: string, mode2: string) => ({
  mode,
  mode2,
  language: 'en',
  wpm: 80,
  rawWpm: 85,
  accuracy: 97.5,
  consistency: 90,
  durationMs: 60_000,
  charStats: { correct: 400, incorrect: 10, extra: 0, missed: 0 },
  punctuation: true,
  numbers: false,
});

describe('daily challenge (e2e)', () => {
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

  it("accepts today's daily result, rejects a stale one, and lists it on the daily board", async () => {
    const server = app.getHttpServer();
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ name: 'daily_racer', email: 'daily@example.com', password: 'a-good-password' })
      .expect(201);
    const cookie = cookieFrom(reg);
    await verifyEmail(app.get(PrismaService), 'daily_racer');

    const today = utcDate(0);
    await request(server)
      .post('/api/results')
      .set('Cookie', cookie)
      .send(result('daily', today))
      .expect(201);

    const stale = await request(server)
      .post('/api/results')
      .set('Cookie', cookie)
      .send(result('daily', utcDate(-2)))
      .expect(400);
    // The validation pipe prefixes every message with its field, like the other 400s.
    expect(stale.body.message).toEqual([
      "mode2: Daily results are only accepted for today's challenge",
    ]);

    const board = await request(server).get('/api/daily?language=en').expect(200);
    expect(board.body).toEqual({
      date: today,
      language: 'en',
      entries: [expect.objectContaining({ rank: 1, name: 'daily_racer', wpm: 80 })],
    });

    // Defaults to English, and each language has its own board.
    const defaulted = await request(server).get('/api/daily').expect(200);
    expect(defaulted.body.language).toBe('en');
    const german = await request(server).get('/api/daily?language=de').expect(200);
    expect(german.body.entries).toEqual([]);

    // The same board is reachable through the leaderboard endpoint.
    const viaLeaderboard = await request(server)
      .get(`/api/leaderboard?mode=daily&mode2=${today}&language=en`)
      .expect(200);
    expect(viaLeaderboard.body).toEqual([expect.objectContaining({ name: 'daily_racer' })]);
  });

  it("ranks each user by their first daily result: a faster retry is saved but does not move the rank", async () => {
    const server = app.getHttpServer();
    const today = utcDate(0);
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'daily@example.com', password: 'a-good-password' })
      .expect(200);
    // A retry at 95 wpm. It is saved (201), but daily_racer keeps the 80 from the first attempt.
    await request(server)
      .post('/api/results')
      .set('Cookie', cookieFrom(login))
      .send({
        ...result('daily', today),
        wpm: 95,
        rawWpm: 100,
        accuracy: 99,
        charStats: { correct: 480, incorrect: 20, extra: 0, missed: 0 },
      })
      .expect(201);

    // daily_second's first attempt is 85 wpm, so it ranks above daily_racer (80).
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ name: 'daily_second', email: 'daily2@example.com', password: 'a-good-password' })
      .expect(201);
    await verifyEmail(app.get(PrismaService), 'daily_second');
    await request(server)
      .post('/api/results')
      .set('Cookie', cookieFrom(reg))
      .send({
        ...result('daily', today),
        wpm: 85,
        rawWpm: 87,
        charStats: { correct: 420, incorrect: 15, extra: 0, missed: 0 },
      })
      .expect(201);

    const board = await request(server).get('/api/daily?language=en').expect(200);
    expect(board.body.entries).toEqual([
      expect.objectContaining({ rank: 1, name: 'daily_second', wpm: 85 }),
      expect.objectContaining({ rank: 2, name: 'daily_racer', wpm: 80 }),
    ]);
  });

  it('accepts weak results but never ranks them', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'daily@example.com', password: 'a-good-password' })
      .expect(200);
    await request(server)
      .post('/api/results')
      .set('Cookie', cookieFrom(login))
      .send(result('weak', 'weak'))
      .expect(201);
    await request(server).get('/api/leaderboard?mode=weak&mode2=weak&language=en').expect(400);
  });
});
