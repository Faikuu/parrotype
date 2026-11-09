import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { isSuspicious } from '../src/admin/suspicious';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyE2eEnv } from './e2e.env';
import { makeAdministrator, sessionFor } from './e2e.helpers';

applyE2eEnv();

/**
 * The admin dashboard, results and audit lists. The database is shared by the e2e files, so every assertion
 * compares with what this file wrote (a baseline read, or a unique marker), never with an absolute total.
 */

const DAY = 86_400_000;
const STAMP = `al${Date.now().toString(36)}`; // unique per run: marks this file's audit rows

describe('admin dashboard, results and audit lists (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let admin: string;
  let aliceId: number;
  let bobId: number;
  let adminId: number;
  let plain: string; // no groups: no permission at all
  const resultIds: Record<string, number> = {};

  const get = (path: string, cookie?: string) => {
    const req = request(server).get(path);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  const resultRow = (overrides: Partial<Record<string, unknown>>) => ({
    mode: 'time',
    mode2: '60',
    language: 'en',
    wpm: 90,
    rawWpm: 95,
    accuracy: 97,
    consistency: 80,
    durationMs: 60_000,
    correctChars: 450,
    incorrectChars: 10,
    extraChars: 0,
    missedChars: 0,
    punctuation: false,
    numbers: false,
    ...overrides,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    const make = async (name: string) =>
      (await prisma.user.create({
        data: { name, nameLower: name.toLowerCase(), email: `${name.toLowerCase()}@example.com`, passwordHash: 'not-used-here' },
        select: { id: true },
      })).id;
    adminId = await make('al_admin');
    await makeAdministrator(prisma, 'al_admin');
    aliceId = await make('al_alice');
    bobId = await make('al_bob');
    await make('al_plain');
    admin = await sessionFor(app, prisma, 'al_admin');
    plain = await sessionFor(app, prisma, 'al_plain');

    const now = Date.now();
    const seeded: Array<[string, number, Record<string, unknown>]> = [
      ['alice-normal', aliceId, resultRow({ mode: 'time', language: 'en', wpm: 80, rawWpm: 85 })],
      ['alice-fast-uneven', aliceId, resultRow({ mode: 'words', mode2: '100', language: 'es', wpm: 200, rawWpm: 210, consistency: 20 })],
      ['bob-above-raw', bobId, resultRow({ mode: 'time', language: 'en', wpm: 120, rawWpm: 100 })],
      ['bob-low-accuracy', bobId, resultRow({ mode: 'quote', mode2: 'short', language: 'pl', wpm: 160, rawWpm: 170, accuracy: 70 })],
      ['bob-ok', bobId, resultRow({ mode: 'time', language: 'en', wpm: 150, rawWpm: 160, accuracy: 80, consistency: 50 })],
      ['alice-old', aliceId, resultRow({ mode: 'time', language: 'en', wpm: 70, rawWpm: 75, createdAt: new Date(now - 40 * DAY) })],
      ['alice-two-days', aliceId, resultRow({ mode: 'time', language: 'en', wpm: 72, rawWpm: 75, createdAt: new Date(now - 2 * DAY) })],
    ];
    for (const [key, userId, data] of seeded) {
      const row = await prisma.result.create({ data: { userId, ...data } as Parameters<typeof prisma.result.create>[0]['data'] });
      resultIds[key] = row.id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/admin/stats', () => {
    it('answers 401 with no session, and 403 without any permission', async () => {
      await get('/api/admin/stats').expect(401);
      await get('/api/admin/stats', plain).expect(403);
    });

    it('has the documented shape: totals, the live race counts, and two 30-day series with zero-filled days', async () => {
      const res = await get('/api/admin/stats', admin).expect(200);
      const body = res.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(
        ['reports', 'races', 'results', 'resultsByDay', 'signupsByDay', 'users'].sort(),
      );
      expect(body.users).toEqual({ total: expect.any(Number), new7d: expect.any(Number), banned: expect.any(Number) });
      expect(body.results).toEqual({ total: expect.any(Number), today: expect.any(Number), last7d: expect.any(Number) });
      expect(body.reports).toEqual({ open: expect.any(Number) });
      // Rooms live in memory per app; this file opens none.
      expect(body.races).toEqual({ rooms: 0, players: 0 });

      for (const key of ['signupsByDay', 'resultsByDay'] as const) {
        const series = body[key] as Array<{ date: string; count: number }>;
        expect(series).toHaveLength(30);
        expect(series[29].date).toBe(new Date().toISOString().slice(0, 10));
        expect(series.map((d) => d.date)).toEqual([...series.map((d) => d.date)].sort());
        for (const day of series) expect(day.count).toEqual(expect.any(Number));
      }
    });

    it('counts what was just written: results today, in the week, and in the 30-day series', async () => {
      const before = (await get('/api/admin/stats', admin).expect(200)).body as {
        results: { total: number; today: number; last7d: number };
        resultsByDay: Array<{ count: number }>;
        users: { total: number; new7d: number };
        signupsByDay: Array<{ count: number }>;
      };

      await prisma.result.create({ data: { userId: aliceId, ...resultRow({}) } as never });
      await prisma.result.create({ data: { userId: aliceId, ...resultRow({}) } as never });
      await prisma.user.create({
        data: { name: `al_new_${STAMP}`, nameLower: `al_new_${STAMP}`, email: `new_${STAMP}@example.com`, passwordHash: 'x' },
      });

      const after = (await get('/api/admin/stats', admin).expect(200)).body as typeof before;
      expect(after.results.total - before.results.total).toBe(2);
      expect(after.results.today - before.results.today).toBe(2);
      expect(after.results.last7d - before.results.last7d).toBe(2);
      expect(after.users.total - before.users.total).toBe(1);
      expect(after.users.new7d - before.users.new7d).toBe(1);
      expect(after.resultsByDay[29].count - before.resultsByDay[29].count).toBe(2);
      expect(after.signupsByDay[29].count - before.signupsByDay[29].count).toBe(1);
    });

    it('buckets a result from two days ago into its own day, not today', async () => {
      const body = (await get('/api/admin/stats', admin).expect(200)).body as { resultsByDay: Array<{ date: string; count: number }> };
      const twoDaysAgo = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
      const day = body.resultsByDay.find((d) => d.date === twoDaysAgo);
      expect(day?.count).toBeGreaterThanOrEqual(1);
      // The 40-day-old result is outside the window and counts nowhere in it.
      const oldDay = new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10);
      expect(body.resultsByDay.some((d) => d.date === oldDay)).toBe(false);
    });
  });

  describe('GET /api/admin/results', () => {
    it('answers 401 with no session, and 403 without results.read', async () => {
      await get('/api/admin/results').expect(401);
      await get('/api/admin/results', plain).expect(403);
    });

    it('lists results with the user name, newest first by default, in the pagination shape', async () => {
      const res = await get('/api/admin/results?user=al_bob', admin).expect(200);
      expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 25 });
      const items = res.body.items as Array<{ user: { id: number; name: string }; createdAt: string }>;
      expect(items.every((i) => i.user.name === 'al_bob' && i.user.id === bobId)).toBe(true);
      const times = items.map((i) => Date.parse(i.createdAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('matches the user name case-insensitively', async () => {
      const upper = await get('/api/admin/results?user=AL_ALICE', admin).expect(200);
      const lower = await get('/api/admin/results?user=al_alice', admin).expect(200);
      expect(upper.body.total).toBe(lower.body.total);
      expect(upper.body.total).toBeGreaterThanOrEqual(4);
    });

    it('filters by mode and language, alone and together', async () => {
      const words = (await get('/api/admin/results?user=al_alice&mode=words', admin).expect(200)).body;
      expect(words.items.map((i: { id: number }) => i.id)).toEqual([resultIds['alice-fast-uneven']]);

      const englishBob = (await get('/api/admin/results?user=al_bob&language=en', admin).expect(200)).body;
      expect(englishBob.items.map((i: { id: number }) => i.id).sort()).toEqual(
        [resultIds['bob-above-raw'], resultIds['bob-ok']].sort(),
      );

      const none = (await get('/api/admin/results?user=al_bob&mode=words', admin).expect(200)).body;
      expect(none.total).toBe(0);
    });

    it('suspicious=true keeps exactly the results the rule flags (checked against the pure predicate)', async () => {
      const res = await get('/api/admin/results?user=al_bob&suspicious=true', admin).expect(200);
      const ids = (res.body.items as Array<{ id: number }>).map((i) => i.id).sort();
      expect(ids).toEqual([resultIds['bob-above-raw'], resultIds['bob-low-accuracy']].sort());

      const all = (await get('/api/admin/results?suspicious=true&pageSize=100', admin).expect(200)).body;
      for (const row of all.items as Array<{ wpm: number; rawWpm: number; accuracy: number; consistency: number }>) {
        expect(isSuspicious(row)).toBe(true);
      }
      expect((all.items as Array<{ id: number }>).map((i) => i.id)).toEqual(
        expect.arrayContaining([resultIds['alice-fast-uneven'], resultIds['bob-above-raw'], resultIds['bob-low-accuracy']]),
      );
    });

    it('suspicious=false is the same as no filter', async () => {
      const plainList = (await get('/api/admin/results?user=al_bob', admin).expect(200)).body;
      const falseList = (await get('/api/admin/results?user=al_bob&suspicious=false', admin).expect(200)).body;
      expect(falseList.total).toBe(plainList.total);
    });

    it('sorts by wpm in both directions', async () => {
      const asc = (await get('/api/admin/results?user=al_bob&sort=wpm&order=asc', admin).expect(200)).body;
      expect(asc.items.map((i: { wpm: number }) => i.wpm)).toEqual([120, 150, 160]);
      const desc = (await get('/api/admin/results?user=al_bob&sort=wpm&order=desc', admin).expect(200)).body;
      expect(desc.items.map((i: { wpm: number }) => i.wpm)).toEqual([160, 150, 120]);
    });

    it('pages with page and pageSize', async () => {
      const second = (await get('/api/admin/results?user=al_bob&sort=wpm&order=asc&page=2&pageSize=2', admin).expect(200)).body;
      expect(second).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(second.items.map((i: { wpm: number }) => i.wpm)).toEqual([160]);
    });

    it('answers 400 for a bad page size, an unknown mode, or an unknown sort', async () => {
      await get('/api/admin/results?pageSize=500', admin).expect(400);
      await get('/api/admin/results?mode=karaoke', admin).expect(400);
      await get('/api/admin/results?sort=name', admin).expect(400);
    });
  });

  describe('GET /api/admin/actions', () => {
    const audit = (suffix: string) => `${STAMP}:${suffix}`;

    beforeAll(async () => {
      // Five rows with known times, so the newest-first order is checked exactly. Their targets carry the marker.
      const base = Date.now() - 60_000;
      const rows: Array<[string, number, string | null]> = [
        ['quote_create', adminId, 'a'],
        ['ban', adminId, 'b'],
        ['quote_create', adminId, 'c'],
        ['quote_delete', adminId, 'd'],
        ['race_close', adminId, 'e'],
      ];
      for (const [i, [action, actor, suffix]] of rows.entries()) {
        await prisma.adminAction.create({
          data: { adminId: actor, action, target: audit(suffix as string), createdAt: new Date(base + i * 1000) },
        });
      }
    });

    it('answers 401 with no session, and 403 without audit.read', async () => {
      await get('/api/admin/actions').expect(401);
      await get('/api/admin/actions', plain).expect(403);
    });

    it('pages newest first, with the total of the filtered rows', async () => {
      const first = (await get(`/api/admin/actions?target=${STAMP}&pageSize=2`, admin).expect(200)).body;
      expect(first).toMatchObject({ total: 5, page: 1, pageSize: 2 });
      expect(first.items.map((i: { target: string }) => i.target)).toEqual([audit('e'), audit('d')]);

      const last = (await get(`/api/admin/actions?target=${STAMP}&pageSize=2&page=3`, admin).expect(200)).body;
      expect(last.items.map((i: { target: string }) => i.target)).toEqual([audit('a')]);
    });

    it('filters by action', async () => {
      const quotes = (await get(`/api/admin/actions?target=${STAMP}&action=quote_create`, admin).expect(200)).body;
      expect(quotes.total).toBe(2);
      expect(quotes.items.map((i: { action: string }) => i.action)).toEqual(['quote_create', 'quote_create']);
    });

    it('filters by the admin name (case-insensitive), and an unknown name matches nothing', async () => {
      const mine = (await get(`/api/admin/actions?target=${STAMP}&admin=AL_ADMIN`, admin).expect(200)).body;
      expect(mine.total).toBe(5);
      expect(mine.items.every((i: { adminName: string | null }) => i.adminName === 'al_admin')).toBe(true);

      const nobody = (await get(`/api/admin/actions?target=${STAMP}&admin=al_nobody_here`, admin).expect(200)).body;
      expect(nobody).toMatchObject({ total: 0, items: [] });
    });

    it('matches the target as a substring', async () => {
      const one = (await get(`/api/admin/actions?target=${STAMP}:c`, admin).expect(200)).body;
      expect(one.items.map((i: { target: string }) => i.target)).toEqual([audit('c')]);
    });

    it('answers 400 for a page size above 100', async () => {
      await get('/api/admin/actions?pageSize=101', admin).expect(400);
    });
  });
});
