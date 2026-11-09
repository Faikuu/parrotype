import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { dailyWords, quoteToWords, type TestConfig } from '@parrotype/engine';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { utcDate } from '../src/common/dates';
import { LeaderboardService } from '../src/leaderboard/leaderboard.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResultEvents, type ResultSavedEvent } from '../src/results/result-events';
import { applyE2eEnv } from './e2e.env';
import { sessionFor } from './e2e.helpers';
import { base, liveRun, POOL, replayOf, resultFields, typeWords, type Key } from './replay.fixtures';

// Config is read lazily (getEnv), so setting it here, before the app is built, is enough.
applyE2eEnv();

/**
 * Results with replays: verification, the replay endpoint, the verified filter, the email and ban rules on
 * boards, events, the text checks, the 'saved' hook and the body limits. Users are named vf_*, and the
 * afterAll removes them with their results, so the other e2e files see the database as they expect it.
 */
describe('results verification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  const WORDS = POOL.slice(0, 10);
  const config10: TestConfig = { ...base, mode: 'words', words: 10, language: 'de' };

  /** A finished 10-word run in German, typed with a few mistakes. */
  function wordsRun(seed: number) {
    const keys = typeWords(WORDS, seed, { mistakeRate: 0.1, startAt: 0 });
    const state = liveRun(config10, WORDS, {}, keys);
    expect(state.status).toBe('finished');
    return state;
  }

  /** The body of a words/10 submission for a run, with its replay. */
  const wordsBody = (seed: number) => {
    const state = wordsRun(seed);
    return { ...resultFields(config10, state, 'words', '10'), replay: replayOf(state) };
  };

  /**
   * An account with a session cookie. Created in the database, not through registration, which is throttled to
   * 10 a minute. `verified` sets the email as verified, as the link in the verification mail does.
   */
  async function makeUser(name: string, verified = true): Promise<string> {
    await prisma.user.create({
      data: {
        name,
        nameLower: name,
        email: `${name}@example.com`,
        passwordHash: bcrypt.hashSync('a-good-password', 4),
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
    return sessionFor(app, prisma, name);
  }

  const submit = (cookie: string, body: object) => request(server()).post('/api/results').set('Cookie', cookie).send(body);

  beforeAll(async () => {
    // The submit throttle is covered in submit-throttle.e2e-spec.ts; this file posts many results quickly.
    // The throttler is a global APP_GUARD, which overrideGuard can't reach, so its storage never counts here.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }) })
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { nameLower: { startsWith: 'vf_' } } });
    await prisma.event.deleteMany({ where: { slug: { startsWith: 'vf-' } } });
    await prisma.quote.deleteMany({ where: { language: 'pl', source: 'results-verify e2e' } });
    await app.close();
  });

  describe('a words test with its replay', () => {
    let typist: string;
    let verifiedId: number;

    beforeAll(async () => {
      typist = await makeUser('vf_typist');
    });

    it('is verified, stored with its replay, and served by GET /api/results/:id/replay', async () => {
      const body = wordsBody(11);
      const res = await submit(typist, body).expect(201);
      expect(res.body).toMatchObject({ verified: true, mode: 'words', mode2: '10', language: 'de' });
      verifiedId = res.body.id;

      const replay = await request(server()).get(`/api/results/${verifiedId}/replay`).expect(200);
      expect(replay.body.result).toEqual({
        id: verifiedId,
        name: 'vf_typist',
        mode: 'words',
        mode2: '10',
        language: 'de',
        wpm: body.wpm,
        rawWpm: body.rawWpm,
        accuracy: body.accuracy,
        consistency: body.consistency,
        durationMs: body.durationMs,
        createdAt: expect.any(String),
      });
      expect(replay.body.replay).toMatchObject({ v: 1, words: body.replay.words });
      expect(replay.body.replay.events).toHaveLength(body.replay.events.length);
    });

    it('refuses tampered stats, keystrokes and words with 400, and saves nothing', async () => {
      const body = wordsBody(12);
      const message = "The result doesn't match its keystrokes";

      const inflated = await submit(typist, { ...body, wpm: body.wpm - 4 }).expect(400);
      expect(inflated.body.message).toBe(message);

      const events = body.replay.events.filter((_, i) => i !== Math.floor(body.replay.events.length / 2));
      const dropped = await submit(typist, { ...body, replay: { ...body.replay, events } }).expect(400);
      expect(dropped.body.message).toBe(message);

      const words = body.replay.words.map((w, i) => (i === 0 ? 'zzzz' : w));
      const changed = await submit(typist, { ...body, replay: { ...body.replay, words } }).expect(400);
      expect(changed.body.message).toBe(message);

      expect(await prisma.result.count({ where: { user: { nameLower: 'vf_typist' } } })).toBe(1);
    });

    it('keeps a replay-less result unverified, with no replay to serve', async () => {
      const plain = await submit(typist, { ...wordsBody(13), replay: undefined }).expect(201);
      expect(plain.body.verified).toBe(false);
      await request(server()).get(`/api/results/${plain.body.id}/replay`).expect(404);
    });

    it('has no replay for an unknown id or a non-number id', async () => {
      await request(server()).get('/api/results/999999999/replay').expect(404);
      await request(server()).get('/api/results/abc/replay').expect(400);
    });
  });

  describe('leaderboards', () => {
    let fast: string;
    let unverifiedUser: string;
    let verifiedRunId: number;

    beforeAll(async () => {
      fast = await makeUser('vf_second');
      unverifiedUser = await makeUser('vf_unverified', false);
    });

    it('lists an unverified result on the default board, and only verified ones with verified=true', async () => {
      // vf_second's result is faster, but it has no replay, so it is not verified.
      const fastBody = {
        mode: 'words', mode2: '10', language: 'de', wpm: 200, rawWpm: 210, accuracy: 99, consistency: 90,
        durationMs: 10_000, charStats: { correct: 170, incorrect: 5, extra: 0, missed: 0 },
        punctuation: false, numbers: false,
      };
      await submit(fast, fastBody).expect(201);
      const honest = await submit(await makeUser('vf_honest'), wordsBody(14)).expect(201);
      verifiedRunId = honest.body.id;

      const all = await request(server()).get('/api/leaderboard?mode=words&mode2=10&language=de').expect(200);
      const second = all.body.find((e: { name: string }) => e.name === 'vf_second');
      expect(second).toMatchObject({ verified: false });
      expect(second.resultId).toEqual(expect.any(Number));

      const onlyVerified = await request(server())
        .get('/api/leaderboard?mode=words&mode2=10&language=de&verified=true')
        .expect(200);
      expect(onlyVerified.body.map((e: { name: string }) => e.name)).not.toContain('vf_second');
      expect(onlyVerified.body.every((e: { verified: boolean }) => e.verified)).toBe(true);
      expect(onlyVerified.body.map((e: { resultId: number }) => e.resultId)).toContain(verifiedRunId);
    });

    it('leaves out users whose email is not verified, even with a verified replay', async () => {
      await submit(unverifiedUser, wordsBody(15)).expect(201);
      const board = await request(server()).get('/api/leaderboard?mode=words&mode2=10&language=de').expect(200);
      expect(board.body.map((e: { name: string }) => e.name)).not.toContain('vf_unverified');
    });

    it('leaves out a banned user, and does not serve their replay', async () => {
      const banned = await makeUser('vf_banned');
      const res = await submit(banned, wordsBody(16)).expect(201);
      await request(server()).get(`/api/results/${res.body.id}/replay`).expect(200);

      await prisma.user.update({ where: { nameLower: 'vf_banned' }, data: { bannedAt: new Date(), banReason: 'e2e' } });
      await request(server()).get(`/api/results/${res.body.id}/replay`).expect(404);
      const board = await request(server()).get('/api/leaderboard?mode=words&mode2=10&language=de').expect(200);
      expect(board.body.map((e: { name: string }) => e.name)).not.toContain('vf_banned');
    });
  });

  describe("the 'saved' event", () => {
    it('is emitted after each save, with isNewBest for a faster verified run only', async () => {
      const cookie = await makeUser('vf_events');
      const events = app.get(ResultEvents);
      const seen: ResultSavedEvent[] = [];
      const listener = (payload: ResultSavedEvent) => seen.push(payload);
      events.on('saved', listener);
      try {
        const first = wordsBody(17);
        const a = await submit(cookie, first).expect(201);
        const second = wordsBody(18);
        const b = await submit(cookie, second).expect(201);
        await submit(cookie, { ...wordsBody(19), replay: undefined }).expect(201);

        expect(seen).toHaveLength(3);
        expect(seen[0]).toMatchObject({ resultId: a.body.id, verified: true, isNewBest: true, mode: 'words', language: 'de' });
        expect(seen[1]).toMatchObject({ resultId: b.body.id, verified: true, isNewBest: second.wpm > first.wpm });
        expect(seen[2]).toMatchObject({ verified: false, isNewBest: false });
      } finally {
        events.off('saved', listener);
      }
    });
  });

  describe('events', () => {
    const TEXT = 'the quick brown fox jumps over the lazy dog';
    const now = Date.now();
    let event: { id: number };
    let eventCookie: string;

    beforeAll(async () => {
      eventCookie = await makeUser('vf_eventer');
      event = await prisma.event.create({
        data: {
          slug: 'vf-spring', title: 'Spring cup', language: 'en', text: TEXT,
          startsAt: new Date(now - 3_600_000), endsAt: new Date(now + 3_600_000),
        },
      });
      await prisma.event.create({
        data: {
          slug: 'vf-over', title: 'Over', language: 'en', text: TEXT,
          startsAt: new Date(now - 7_200_000), endsAt: new Date(now - 300_000),
        },
      });
      await prisma.event.create({
        data: {
          slug: 'vf-grace', title: 'Grace', language: 'en', text: TEXT,
          startsAt: new Date(now - 3_600_000), endsAt: new Date(now - 30_000),
        },
      });
    });

    /** A finished run of the event text. */
    function eventBody(slug: string, text = TEXT, seed = 20) {
      const words = quoteToWords(text);
      const config: TestConfig = { ...base, mode: 'custom', language: 'en' };
      const state = liveRun(config, words, {}, typeWords(words, seed, { mistakeRate: 0.05, startAt: 0 }));
      expect(state.status).toBe('finished');
      return { ...resultFields(config, state, 'event', slug), replay: replayOf(state) };
    }

    it('saves a verified event result, and the event board ranks it', async () => {
      const res = await submit(eventCookie, eventBody('vf-spring')).expect(201);
      expect(res.body.verified).toBe(true);
      const row = await prisma.result.findUniqueOrThrow({ where: { id: res.body.id }, select: { eventId: true } });
      expect(row.eventId).toBe(event.id);

      const board = await app.get(LeaderboardService).eventLeaderboard(event.id);
      expect(board).toEqual([expect.objectContaining({ name: 'vf_eventer', verified: true, resultId: res.body.id })]);
    });

    it('leaves a user with an unverified email off the event board', async () => {
      const cookie = await makeUser('vf_eventless', false);
      await submit(cookie, eventBody('vf-spring', TEXT, 21)).expect(201);
      const board = await app.get(LeaderboardService).eventLeaderboard(event.id);
      expect(board.map((e) => e.name)).not.toContain('vf_eventless');
    });

    it('accepts a result up to 60 seconds after the event ends', async () => {
      await submit(eventCookie, eventBody('vf-grace', TEXT, 22)).expect(201);
    });

    it('refuses an event that is over, and an unknown event', async () => {
      const over = await submit(eventCookie, eventBody('vf-over', TEXT, 23)).expect(400);
      expect(over.body.message).toBe('This event is not running');
      const unknown = await submit(eventCookie, eventBody('vf-none', TEXT, 24)).expect(404);
      expect(unknown.body.message).toBe('Event not found');
    });

    it('needs the event text, a replay and the event language', async () => {
      const wrongText = await submit(eventCookie, eventBody('vf-spring', 'a different text entirely here', 25)).expect(400);
      expect(wrongText.body.message).toBe("The text doesn't match this event");

      const noReplay: Record<string, unknown> = { ...eventBody('vf-spring', TEXT, 26) };
      delete noReplay.replay;
      await submit(eventCookie, noReplay).expect(400);

      const german = await submit(eventCookie, { ...eventBody('vf-spring', TEXT, 27), language: 'de' }).expect(400);
      expect(german.body.message).toBe('This event is in another language');
    });
  });

  describe('text checks', () => {
    it("daily: the words must be today's daily words", async () => {
      const cookie = await makeUser('vf_daily');
      const today = utcDate(0);
      const words = dailyWords(today, 'en');
      const config: TestConfig = { ...base, mode: 'daily', language: 'en', punctuation: true, numbers: false };
      const state = liveRun(config, words, {}, typeWords(words, 30, { mistakeRate: 0.03, startAt: 0 }));
      expect(state.status).toBe('finished');
      const body = { ...resultFields(config, state, 'daily', today), punctuation: true, replay: replayOf(state) };

      const ok = await submit(cookie, body).expect(201);
      expect(ok.body.verified).toBe(true);

      const other = dailyWords(utcDate(-1), 'en');
      const wrong = await submit(cookie, { ...body, replay: { ...body.replay, words: other } }).expect(400);
      expect(wrong.body.message).toBe("The text doesn't match today's daily challenge");
    });

    it('quote: the words must be a known quote in the language', async () => {
      const cookie = await makeUser('vf_quoter');
      const text = 'Ala ma kota i psa.';
      await prisma.quote.create({ data: { language: 'pl', text, source: 'results-verify e2e', length: text.length } });
      const words = quoteToWords(text);
      const config: TestConfig = { ...base, mode: 'quote', language: 'pl', quoteLength: 'short' };
      const state = liveRun(config, words, {}, typeWords(words, 31, { startAt: 0 }));
      const body = { ...resultFields(config, state, 'quote', 'short'), replay: replayOf(state) };

      expect((await submit(cookie, body).expect(201)).body.verified).toBe(true);

      const unknown = ['Ala', 'ma', 'kota.'];
      const res = await submit(cookie, { ...body, replay: { ...body.replay, words: unknown } }).expect(400);
      expect(res.body.message).toBe("The text doesn't match a known quote");
    });
  });

  describe('body limits', () => {
    it('accepts a 200 KB replay on POST /api/results, and refuses a 300 KB body there', async () => {
      const cookie = await makeUser('vf_big');
      // Zen: the typed text is the target, so a long run is a valid replay with no text check.
      const zen: TestConfig = { ...base, mode: 'zen', language: 'en' };
      const keys: Key[] = [];
      let at = 0;
      for (const ch of 'lorem ipsum dolor sit amet '.repeat(230)) {
        at += 100;
        keys.push(ch === ' ' ? { at, kind: 's' } : { at, kind: 'c', ch });
      }
      keys.push({ at: at + 100, kind: 'n' });
      const state = liveRun(zen, [], {}, keys);
      expect(state.status).toBe('finished');
      const body = { ...resultFields(zen, state, 'zen', 'zen'), replay: replayOf(state) };
      const size = Buffer.byteLength(JSON.stringify(body));
      expect(size).toBeGreaterThan(150 * 1024);
      expect(size).toBeLessThan(256 * 1024);

      await submit(cookie, body).expect(201);
      const huge = JSON.stringify({ ...body, padding: 'x'.repeat(300 * 1024) });
      await request(server()).post('/api/results').set('Cookie', cookie).set('Content-Type', 'application/json').send(huge).expect(413);
    });

    it('keeps 50 KB on the other routes: a 100 KB login body is 413', async () => {
      const big = JSON.stringify({ email: 'x@example.com', password: 'a'.repeat(100 * 1024) });
      await request(server()).post('/api/auth/login').set('Content-Type', 'application/json').send(big).expect(413);
    });
  });
});
