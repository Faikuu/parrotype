import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { utcDate } from '../src/common/dates';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyE2eEnv } from './e2e.env';
import { makeAdministrator, revokeAdministrator } from './e2e.helpers';

applyE2eEnv();

// A fresh app per file. Throttles to keep in mind: the report route allows 5 requests a minute (every
// request counts, including refused ones), register and login 10 a minute, everything else 100 a minute.
const PASSWORD = 'moderation-password-1';
const BOARD = '/api/leaderboard?mode=words&mode2=100&language=es';

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

const wordsResult = (wpm: number) => ({
  mode: 'words',
  mode2: '100',
  language: 'es',
  wpm,
  rawWpm: wpm + 5,
  accuracy: 98,
  consistency: 90,
  durationMs: 60_000,
  charStats: { correct: Math.round((wpm + 5) * 5), incorrect: 0, extra: 0, missed: 0 },
  punctuation: false,
  numbers: false,
});

const svgText = (req: request.Test): request.Test =>
  req.buffer(true).parse((res, callback) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      data += chunk;
    });
    res.on('end', () => callback(null, data));
  });

describe('reports, admin moderation and suspensions (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;

  let target: string;
  let reporter: string;
  let second: string;
  let admin: string;
  let other: string;
  let targetId: number;
  let reportByReporter: number;
  let reportBySecond: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // The daily board is shared with daily.e2e-spec, which checks it exactly, so this file leaves no daily row.
    await prisma.result.deleteMany({ where: { mode: 'daily', user: { nameLower: 'mod_target' } } });
    await app.close();
  });

  async function register(name: string): Promise<string> {
    const res = await request(server)
      .post('/api/auth/register')
      .send({ name, email: `${name}@example.com`, password: PASSWORD })
      .expect(201);
    return cookieFrom(res);
  }

  it('sets up users and results; an admin is granted in the database, as the CLI would', async () => {
    target = await register('mod_target');
    reporter = await register('mod_reporter');
    second = await register('mod_second');
    admin = await register('mod_admin');
    other = await register('mod_other');
    await makeAdministrator(prisma, 'mod_admin');
    targetId = (await prisma.user.findUniqueOrThrow({ where: { nameLower: 'mod_target' } })).id;

    await request(server).post('/api/results').set('Cookie', target).send(wordsResult(95)).expect(201);
    await request(server).post('/api/results').set('Cookie', target).send(wordsResult(70)).expect(201);
    await request(server).post('/api/results').set('Cookie', other).send(wordsResult(60)).expect(201);

    const me = await request(server).get('/api/auth/me').set('Cookie', admin).expect(200);
    expect(me.body.user.permissions).toContain('audit.read');
    expect(me.body.user).not.toHaveProperty('role');
  });

  describe('reports', () => {
    it('files a report once, refuses a second open one and a self report', async () => {
      const first = await request(server)
        .post('/api/users/mod_target/report')
        .set('Cookie', reporter)
        .send({ reason: 'cheating', details: '  copied a snippet  ' })
        .expect(201);
      expect(first.body).toEqual({ ok: true });

      const dup = await request(server)
        .post('/api/users/mod_target/report')
        .set('Cookie', reporter)
        .send({ reason: 'other' })
        .expect(409);
      expect(dup.body.message).toBe('You have already reported this user');

      const self = await request(server)
        .post('/api/users/mod_target/report')
        .set('Cookie', target)
        .send({ reason: 'other' })
        .expect(400);
      expect(self.body.message).toBe("You can't report yourself");

      await request(server)
        .post('/api/users/mod_target/report')
        .set('Cookie', second)
        .send({ reason: 'other' })
        .expect(201);
    });

    it('keeps the admin area closed to anonymous callers (401) and to non-admins (403)', async () => {
      await request(server).get('/api/admin/reports').expect(401);
      const denied = await request(server).get('/api/admin/reports').set('Cookie', reporter).expect(403);
      expect(denied.body.message).toBe('Missing permission: reports.read');
      await request(server).get('/api/admin/actions').set('Cookie', reporter).expect(403);
      await request(server).delete('/api/admin/results/1').set('Cookie', reporter).expect(403);
      await request(server).post(`/api/admin/users/${targetId}/ban`).set('Cookie', reporter).send({ reason: 'x' }).expect(403);
    });

    it('lists open reports for an admin, with the reporter, the target and its recent results', async () => {
      const open = await request(server).get('/api/admin/reports').set('Cookie', admin).expect(200);
      expect(open.body).toMatchObject({ page: 1, pageSize: 25 });
      const forTarget = open.body.items.filter((r: { target: { name: string } }) => r.target.name === 'mod_target');
      expect(forTarget).toHaveLength(2);
      const byReporter = forTarget.find((r: { reporter: { name: string } }) => r.reporter.name === 'mod_reporter');
      const bySecond = forTarget.find((r: { reporter: { name: string } }) => r.reporter.name === 'mod_second');
      expect(byReporter).toMatchObject({ reason: 'cheating', details: 'copied a snippet', status: 'open', target: { bannedAt: null } });
      expect(bySecond).toMatchObject({ reason: 'other', details: null });
      expect(byReporter.targetResults.length).toBeLessThanOrEqual(5);
      expect(byReporter.targetResults.map((r: { wpm: number }) => r.wpm).sort((a: number, b: number) => b - a)).toEqual([95, 70]);
      reportByReporter = byReporter.id;
      reportBySecond = bySecond.id;
    });

    it('resolves and dismisses an open report once each, and moves it between the lists', async () => {
      const resolved = await request(server).post(`/api/admin/reports/${reportByReporter}/resolve`).set('Cookie', admin).expect(200);
      expect(resolved.body).toMatchObject({ id: reportByReporter, status: 'resolved' });
      const again = await request(server).post(`/api/admin/reports/${reportByReporter}/dismiss`).set('Cookie', admin).expect(409);
      expect(again.body.message).toBe('Report is already resolved');

      await request(server).post(`/api/admin/reports/${reportBySecond}/dismiss`).set('Cookie', admin).expect(200);
      await request(server).post('/api/admin/reports/999999/resolve').set('Cookie', admin).expect(404);
      await request(server).post('/api/admin/reports/abc/resolve').set('Cookie', admin).expect(400);

      const open = await request(server).get('/api/admin/reports?status=open').set('Cookie', admin).expect(200);
      const ids = open.body.items.map((r: { id: number }) => r.id);
      expect(ids).not.toContain(reportByReporter);
      expect(ids).not.toContain(reportBySecond);
      const resolvedList = await request(server).get('/api/admin/reports?status=resolved').set('Cookie', admin).expect(200);
      expect(resolvedList.body.items.map((r: { id: number }) => r.id)).toContain(reportByReporter);
      const dismissedList = await request(server).get('/api/admin/reports?status=dismissed').set('Cookie', admin).expect(200);
      expect(dismissedList.body.items.map((r: { id: number }) => r.id)).toContain(reportBySecond);
    });
  });

  describe('results', () => {
    it('lets an admin delete a result; the owner keeps the rest', async () => {
      const best = await prisma.result.findFirstOrThrow({ where: { userId: targetId }, orderBy: { wpm: 'desc' } });
      await request(server).delete(`/api/admin/results/${best.id}`).set('Cookie', admin).expect(200, { ok: true });

      const profile = await request(server).get('/api/users/mod_target').expect(200);
      expect(profile.body.recent.map((r: { wpm: number }) => r.wpm)).toEqual([70]);
      await request(server).delete(`/api/admin/results/${best.id}`).set('Cookie', admin).expect(404);
    });
  });

  describe('suspension', () => {
    it('refuses a ban on an admin (400), an empty reason (400) and a repeat ban (409)', async () => {
      // mod_second is an Administrator for this test: an Administrator can't be suspended, whoever asks.
      await makeAdministrator(prisma, 'mod_second');
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { nameLower: 'mod_second' }, select: { id: true } })).id;
      const admins = await request(server).post(`/api/admin/users/${adminId}/ban`).set('Cookie', admin).send({ reason: 'x' }).expect(400);
      expect(admins.body.message).toBe("Administrators can't be banned");
      await request(server).post(`/api/admin/users/${(await prisma.user.findUniqueOrThrow({ where: { nameLower: 'mod_admin' }, select: { id: true } })).id}/ban`).set('Cookie', admin).send({ reason: 'x' }).expect(400);
      await request(server).post(`/api/admin/users/${targetId}/ban`).set('Cookie', admin).send({ reason: '   ' }).expect(400);
      await request(server).post('/api/admin/users/999999/ban').set('Cookie', admin).send({ reason: 'x' }).expect(404);
    });

    it('bans: the session ends, login is 403, and the account disappears from public views', async () => {
      // A result for today's daily board, so the daily exclusion is tested too.
      await request(server)
        .post('/api/results')
        .set('Cookie', target)
        .send({ ...wordsResult(50), mode: 'daily', mode2: utcDate(0), language: 'en' })
        .expect(201);
      const dailyBefore = await request(server).get('/api/daily?language=en').expect(200);
      expect(dailyBefore.body.entries.map((e: { name: string }) => e.name)).toContain('mod_target');
      const boardBefore = await request(server).get(BOARD).expect(200);
      expect(boardBefore.body.map((e: { name: string }) => e.name)).toContain('mod_target');

      const banned = await request(server)
        .post(`/api/admin/users/${targetId}/ban`)
        .set('Cookie', admin)
        .send({ reason: 'spam accounts' })
        .expect(200);
      expect(banned.body).toMatchObject({ id: targetId, name: 'mod_target' });
      expect(typeof banned.body.bannedAt).toBe('string');
      await request(server).post(`/api/admin/users/${targetId}/ban`).set('Cookie', admin).send({ reason: 'again' }).expect(409);

      // The old cookie is dead: the session reader rejects a suspended account.
      await request(server).get('/api/auth/me').set('Cookie', target).expect(401);
      await request(server).get('/api/results/me').set('Cookie', target).expect(401);
      await request(server)
        .post('/api/results')
        .set('Cookie', target)
        .send(wordsResult(99))
        .expect(401);

      const login = await request(server)
        .post('/api/auth/login')
        .send({ email: 'mod_target@example.com', password: PASSWORD })
        .expect(403);
      expect(login.body.message).toBe('This account has been suspended');

      await request(server).get('/api/users/mod_target').expect(404);
      const badge = await svgText(request(server).get('/api/users/mod_target/badge.svg?mode=words&mode2=100&language=es')).expect(404);
      expect(badge.body).toContain('no result');

      const boardAfter = await request(server).get(BOARD).expect(200);
      expect(boardAfter.body.map((e: { name: string }) => e.name)).not.toContain('mod_target');
      expect(boardAfter.body.map((e: { name: string }) => e.name)).toContain('mod_other');
      const dailyAfter = await request(server).get('/api/daily?language=en').expect(200);
      expect(dailyAfter.body.entries.map((e: { name: string }) => e.name)).not.toContain('mod_target');

      await request(server).put('/api/users/mod_target/follow').set('Cookie', reporter).expect(404);
      // Fifth report request of this file: a suspended user cannot be reported either.
      await request(server).post('/api/users/mod_target/report').set('Cookie', reporter).send({ reason: 'other' }).expect(404);
    });

    it('unban restores the account, but the old session stays dead', async () => {
      const unbanned = await request(server).post(`/api/admin/users/${targetId}/unban`).set('Cookie', admin).expect(200);
      expect(unbanned.body).toMatchObject({ name: 'mod_target', bannedAt: null });
      await request(server).post(`/api/admin/users/${targetId}/unban`).set('Cookie', admin).expect(409);

      await request(server).get('/api/auth/me').set('Cookie', target).expect(401);
      const login = await request(server)
        .post('/api/auth/login')
        .send({ email: 'mod_target@example.com', password: PASSWORD })
        .expect(200);
      const fresh = cookieFrom(login);
      await request(server).get('/api/auth/me').set('Cookie', fresh).expect(200);

      await request(server).get('/api/users/mod_target').expect(200);
      const board = await request(server).get(BOARD).expect(200);
      expect(board.body.map((e: { name: string }) => e.name)).toContain('mod_target');
    });

    it('records the actions in the audit log, with the admin name', async () => {
      const actions = await request(server).get('/api/admin/actions?pageSize=100').set('Cookie', admin).expect(200);
      const kinds = actions.body.items.map((a: { action: string }) => a.action);
      expect(kinds).toEqual(
        expect.arrayContaining(['resolve_report', 'dismiss_report', 'delete_result', 'ban', 'unban']),
      );
      const ban = actions.body.items.find((a: { action: string }) => a.action === 'ban');
      expect(ban).toMatchObject({
        adminName: 'mod_admin',
        target: `user:${targetId}`,
        note: 'spam accounts',
      });
      expect(actions.body.items.find((a: { action: string }) => a.action === 'resolve_report')).toMatchObject({
        target: `report:${reportByReporter}`,
        adminName: 'mod_admin',
      });
    });

    it('reads the groups from the database: a removed admin loses access on the next request', async () => {
      await makeAdministrator(prisma, 'mod_second');
      await request(server).get('/api/admin/actions').set('Cookie', second).expect(200);

      await revokeAdministrator(prisma, 'mod_second');
      await request(server).get('/api/admin/actions').set('Cookie', second).expect(403);
    });
  });
});
