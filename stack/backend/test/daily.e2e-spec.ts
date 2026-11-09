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
import { dailyRun } from './replay.fixtures';

applyE2eEnv();

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

/** A result with no replay: saved unverified, so it stays off the boards. Used where only validation matters. */
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
  /** daily_racer's first daily result, as posted (a slow run). */
  let racerFirst: { wpm: number };

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
    const first = dailyRun(utcDate(0), 101, 1.0);
    const posted = await request(server).post('/api/results').set('Cookie', cookie).send(first).expect(201);
    expect(posted.body).toMatchObject({ verified: true, mode: 'daily', mode2: today });
    racerFirst = { wpm: first.wpm };

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
      entries: [expect.objectContaining({ rank: 1, name: 'daily_racer', wpm: first.wpm })],
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
    // A retry, typed faster. It is verified and saved (201), but daily_racer keeps the first attempt.
    const retry = dailyRun(utcDate(0), 102, 0.6);
    const saved = await request(server).post('/api/results').set('Cookie', cookieFrom(login)).send(retry).expect(201);
    expect(saved.body.verified).toBe(true);
    expect(retry.wpm).toBeGreaterThan(racerFirst.wpm);

    // daily_second's first attempt is faster than daily_racer's first, so it ranks above.
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ name: 'daily_second', email: 'daily2@example.com', password: 'a-good-password' })
      .expect(201);
    await verifyEmail(app.get(PrismaService), 'daily_second');
    const second = dailyRun(utcDate(0), 103, 0.7);
    await request(server).post('/api/results').set('Cookie', cookieFrom(reg)).send(second).expect(201);
    expect(second.wpm).toBeGreaterThan(racerFirst.wpm);

    const board = await request(server).get('/api/daily?language=en').expect(200);
    expect(board.body.entries).toEqual([
      expect.objectContaining({ rank: 1, name: 'daily_second', wpm: second.wpm }),
      expect.objectContaining({ rank: 2, name: 'daily_racer', wpm: racerFirst.wpm }),
    ]);
    const viaLeaderboard = await request(server)
      .get(`/api/leaderboard?mode=daily&mode2=${today}&language=en`)
      .expect(200);
    expect(viaLeaderboard.body.map((e: { name: string }) => e.name)).toEqual(['daily_second', 'daily_racer']);
  });

  it('leaves an unverified daily result off the board', async () => {
    const server = app.getHttpServer();
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ name: 'daily_plain', email: 'daily3@example.com', password: 'a-good-password' })
      .expect(201);
    await verifyEmail(app.get(PrismaService), 'daily_plain');
    // No replay: saved unverified, and the daily board (verified results only) does not list it.
    await request(server).post('/api/results').set('Cookie', cookieFrom(reg)).send(result('daily', utcDate(0))).expect(201);
    const board = await request(server).get('/api/daily?language=en').expect(200);
    expect(board.body.entries.map((e: { name: string }) => e.name)).not.toContain('daily_plain');
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
