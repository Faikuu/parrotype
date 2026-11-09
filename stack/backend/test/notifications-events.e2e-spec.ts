import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResultEvents } from '../src/results/result-events';
import { applyE2eEnv } from './e2e.env';
import { sessionFor } from './e2e.helpers';

applyE2eEnv();

jest.setTimeout(30_000);

/**
 * Notifications (follow, report outcome, pb_beaten), site announcements and typing events. The database is shared
 * with the other e2e files, so every name and slug here carries the ntf / ntf- prefix.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const TEXT = 'The quick brown fox jumps over the lazy dog again and again.';

describe('notifications, announcements and events (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeUser(name: string): Promise<number> {
    return (
      await prisma.user.create({
        data: { name, nameLower: name.toLowerCase(), email: `${name.toLowerCase()}@example.com`, passwordHash: 'not-used-here' },
        select: { id: true },
      })
    ).id;
  }

  /** A group with exactly these permissions, and one member. Returns the member's session cookie. */
  async function permissionUser(name: string, groupName: string, permissions: string[]): Promise<string> {
    const userId = await makeUser(name);
    const group = await prisma.permissionGroup.create({
      data: { name: groupName, description: 'e2e', permissions: { create: permissions.map((permission) => ({ permission })) } },
      select: { id: true },
    });
    await prisma.userGroup.create({ data: { userId, groupId: group.id } });
    return sessionFor(app, prisma, name.toLowerCase());
  }

  async function wordsResult(userId: number, wpm: number, overrides: { verified?: boolean; mode?: string; mode2?: string; language?: string } = {}): Promise<number> {
    const row = await prisma.result.create({
      data: {
        userId,
        mode: overrides.mode ?? 'time',
        mode2: overrides.mode2 ?? '60',
        language: overrides.language ?? 'en',
        wpm,
        rawWpm: wpm + 5,
        accuracy: 98,
        consistency: 90,
        durationMs: 60_000,
        correctChars: 300,
        incorrectChars: 0,
        extraChars: 0,
        missedChars: 0,
        punctuation: false,
        numbers: false,
        verified: overrides.verified ?? true,
      },
      select: { id: true },
    });
    return row.id;
  }

  async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 3000): Promise<T> {
    const until = Date.now() + ms;
    let value = await read();
    while (!done(value) && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      value = await read();
    }
    return value;
  }

  describe('follow and report notifications', () => {
    let alice: string;
    let bob: string;
    let carol: string;
    let reporterCookie: string;
    let adminCookie: string;

    beforeAll(async () => {
      await makeUser('ntf_alice');
      await makeUser('ntf_bob');
      await makeUser('ntf_carol');
      alice = await sessionFor(app, prisma, 'ntf_alice');
      bob = await sessionFor(app, prisma, 'ntf_bob');
      carol = await sessionFor(app, prisma, 'ntf_carol');
      reporterCookie = await sessionFor(app, prisma, 'ntf_carol');
      adminCookie = await permissionUser('ntf_admin', 'Ntf Moderators', ['reports.read', 'reports.resolve']);
    });

    it('requires a session to read notifications', async () => {
      await request(server).get('/api/notifications').expect(401);
      await request(server).get('/api/notifications/unread-count').expect(401);
      await request(server).post('/api/notifications/read').send({}).expect(401);
    });

    it('a follow notifies the followee: unread count 1, then 0 after marking read', async () => {
      await request(server).put('/api/users/ntf_bob/follow').set('Cookie', alice).expect(200);

      expect((await request(server).get('/api/notifications/unread-count').set('Cookie', bob).expect(200)).body).toEqual({ count: 1 });
      const list = (await request(server).get('/api/notifications').set('Cookie', bob).expect(200)).body;
      expect(list).toMatchObject({ total: 1, page: 1, pageSize: 25 });
      expect(list.items[0]).toMatchObject({ kind: 'follow', data: { by: 'ntf_alice' }, readAt: null });

      expect((await request(server).post('/api/notifications/read').set('Cookie', bob).send({}).expect(200)).body).toEqual({ updated: 1 });
      expect((await request(server).get('/api/notifications/unread-count').set('Cookie', bob).expect(200)).body).toEqual({ count: 0 });
      const unread = (await request(server).get('/api/notifications?unread=true').set('Cookie', bob).expect(200)).body;
      expect(unread.total).toBe(0);
    });

    it('does not repeat the follow notice for the same follower within 24 hours', async () => {
      await request(server).delete('/api/users/ntf_bob/follow').set('Cookie', alice).expect(200);
      await request(server).put('/api/users/ntf_bob/follow').set('Cookie', alice).expect(200);
      expect((await request(server).get('/api/notifications/unread-count').set('Cookie', bob).expect(200)).body).toEqual({ count: 0 });
    });

    it('mark-read ignores ids that belong to someone else', async () => {
      await request(server).put('/api/users/ntf_carol/follow').set('Cookie', alice).expect(200);
      const carolRow = await prisma.notification.findFirstOrThrow({ where: { userId: (await prisma.user.findUniqueOrThrow({ where: { nameLower: 'ntf_carol' }, select: { id: true } })).id } });
      expect((await request(server).post('/api/notifications/read').set('Cookie', bob).send({ ids: [carolRow.id] }).expect(200)).body).toEqual({ updated: 0 });
      expect((await request(server).get('/api/notifications/unread-count').set('Cookie', carol).expect(200)).body).toEqual({ count: 1 });
    });

    it('a report decision notifies the reporter without revealing the decision', async () => {
      const targetId = await makeUser('ntf_target');
      const reporterId = (await prisma.user.findUniqueOrThrow({ where: { nameLower: 'ntf_carol' }, select: { id: true } })).id;
      const report = await prisma.report.create({
        data: { reporterId, targetId, reason: 'other', details: 'e2e' },
        select: { id: true },
      });
      await request(server).post(`/api/admin/reports/${report.id}/dismiss`).set('Cookie', adminCookie).expect(200);

      const list = (await request(server).get('/api/notifications?unread=true').set('Cookie', reporterCookie).expect(200)).body;
      const outcome = list.items.find((item: { kind: string }) => item.kind === 'report_outcome');
      expect(outcome).toBeDefined();
      expect(outcome.data).toEqual({ target: 'ntf_target' });
      expect(JSON.stringify(outcome)).not.toMatch(/dismiss|resolv/i);
    });
  });

  describe('pb_beaten', () => {
    let saverId: number;

    beforeAll(async () => {
      saverId = await makeUser('ntf_saver');
      const bobRow = await prisma.user.findUniqueOrThrow({ where: { nameLower: 'ntf_bob' }, select: { id: true } });
      const dave = await makeUser('ntf_dave');
      const erin = await makeUser('ntf_erin');
      await wordsResult(bobRow.id, 50);
      await wordsResult(erin, 120, { verified: false }); // an unverified best does not count for the followers
      for (const followerId of [bobRow.id, dave, erin]) {
        await prisma.follow.create({ data: { followerId, followeeId: saverId } });
      }
      await wordsResult(dave, 0, { verified: true }); // a zero best is no best at all
    });

    const emit = (event: Partial<{ resultId: number; userId: number; mode: string; mode2: string; language: string; wpm: number; verified: boolean; isNewBest: boolean }>) =>
      app.get(ResultEvents).emit('saved', {
        resultId: 0,
        userId: saverId,
        mode: 'time',
        mode2: '60',
        language: 'en',
        wpm: 80,
        verified: true,
        isNewBest: true,
        ...event,
      });

    it('notifies only the followers whose best the new one beats', async () => {
      const resultId = await wordsResult(saverId, 80);
      emit({ resultId, wpm: 80 });
      const bob = await sessionFor(app, prisma, 'ntf_bob');
      const bobList = await waitFor(
        () => request(server).get('/api/notifications?unread=true').set('Cookie', bob).then((r) => r.body),
        (body) => body.items.some((item: { kind: string }) => item.kind === 'pb_beaten'),
      );
      const beat = bobList.items.find((item: { kind: string }) => item.kind === 'pb_beaten');
      expect(beat.data).toEqual({ by: 'ntf_saver', mode: 'time', mode2: '60', language: 'en', wpm: 80 });

      const dave = await sessionFor(app, prisma, 'ntf_dave');
      const erin = await sessionFor(app, prisma, 'ntf_erin');
      expect((await request(server).get('/api/notifications/unread-count').set('Cookie', dave).expect(200)).body).toEqual({ count: 0 });
      expect((await request(server).get('/api/notifications/unread-count').set('Cookie', erin).expect(200)).body).toEqual({ count: 0 });
    });

    it('does nothing for an unverified, an unranked or a not-new-best result', async () => {
      const bob = await sessionFor(app, prisma, 'ntf_bob');
      const before = (await request(server).get('/api/notifications/unread-count').set('Cookie', bob).expect(200)).body.count;
      emit({ resultId: 0, verified: false, wpm: 90 });
      emit({ resultId: 0, mode: 'code', mode2: 'js', wpm: 90 });
      emit({ resultId: 0, isNewBest: false, wpm: 90 });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect((await request(server).get('/api/notifications/unread-count').set('Cookie', bob).expect(200)).body.count).toBe(before);
    });
  });

  describe('announcements', () => {
    let admin: string;
    let ids: { active: number; future: number; expired: number };

    beforeAll(async () => {
      admin = await permissionUser('ntf_announcer', 'Ntf Announcers', ['announcements.manage']);
    });

    it('refuses the admin routes without announcements.manage (403) and without a session (401)', async () => {
      await request(server).get('/api/admin/announcements').expect(401);
      const plain = await sessionFor(app, prisma, 'ntf_carol');
      await request(server).post('/api/admin/announcements').set('Cookie', plain).send({ message: 'x', startsAt: iso(0) }).expect(403);
    });

    it('creates, validates and audits announcements', async () => {
      const active = await request(server)
        .post('/api/admin/announcements')
        .set('Cookie', admin)
        .send({ message: 'Maintenance tonight', level: 'warning', startsAt: iso(-HOUR) })
        .expect(201);
      const future = await request(server)
        .post('/api/admin/announcements')
        .set('Cookie', admin)
        .send({ message: 'Coming soon', startsAt: iso(DAY) })
        .expect(201);
      const expired = await request(server)
        .post('/api/admin/announcements')
        .set('Cookie', admin)
        .send({ message: 'Already over', startsAt: iso(-2 * DAY), endsAt: iso(-DAY) })
        .expect(201);
      expect(active.body).toMatchObject({ message: 'Maintenance tonight', level: 'warning', endsAt: null });
      expect(future.body.level).toBe('info');
      ids = { active: active.body.id, future: future.body.id, expired: expired.body.id };

      await request(server).post('/api/admin/announcements').set('Cookie', admin).send({ message: '', startsAt: iso(0) }).expect(400);
      await request(server).post('/api/admin/announcements').set('Cookie', admin).send({ message: 'x'.repeat(281), startsAt: iso(0) }).expect(400);
      await request(server).post('/api/admin/announcements').set('Cookie', admin).send({ message: 'x', level: 'error', startsAt: iso(0) }).expect(400);
      await request(server)
        .post('/api/admin/announcements')
        .set('Cookie', admin)
        .send({ message: 'x', startsAt: iso(HOUR), endsAt: iso(0) })
        .expect(400);

      const audit = await prisma.adminAction.findFirst({ where: { action: 'announcement_create', target: `announcement:${ids.active}` } });
      expect(audit).not.toBeNull();
    });

    it('lists only the active ones on the public endpoint, at most three, with no sign-in', async () => {
      const body = (await request(server).get('/api/announcements/active').expect(200)).body as Array<{ id: number }>;
      const shown = body.map((a) => a.id);
      expect(shown).toContain(ids.active);
      expect(shown).not.toContain(ids.future);
      expect(shown).not.toContain(ids.expired);
      expect(body.length).toBeLessThanOrEqual(3);
    });

    it('edits merge the stored window, and a delete removes the banner', async () => {
      await request(server).patch(`/api/admin/announcements/${ids.active}`).set('Cookie', admin).send({ endsAt: iso(-2 * HOUR) }).expect(400);
      await request(server).patch(`/api/admin/announcements/${ids.active}`).set('Cookie', admin).send({ message: 'Changed' }).expect(200);
      await request(server).patch(`/api/admin/announcements/${ids.active}`).set('Cookie', admin).send({ endsAt: null }).expect(200);
      await request(server).patch('/api/admin/announcements/999999').set('Cookie', admin).send({ message: 'x' }).expect(404);

      await request(server).delete(`/api/admin/announcements/${ids.active}`).set('Cookie', admin).expect(200);
      const body = (await request(server).get('/api/announcements/active').expect(200)).body as Array<{ id: number }>;
      expect(body.map((a) => a.id)).not.toContain(ids.active);
      expect(await prisma.adminAction.count({ where: { action: 'announcement_delete', target: `announcement:${ids.active}` } })).toBe(1);
    });
  });

  describe('events', () => {
    let admin: string;
    let liveId: number;
    let futureId: number;

    beforeAll(async () => {
      admin = await permissionUser('ntf_eventer', 'Ntf Event Managers', ['events.manage']);
    });

    const base = (slug: string, startsAt: string, endsAt: string) => ({
      slug,
      title: `Event ${slug}`,
      description: 'An e2e event',
      language: 'en',
      text: TEXT,
      startsAt,
      endsAt,
    });

    it('refuses the admin routes without events.manage (403)', async () => {
      const plain = await sessionFor(app, prisma, 'ntf_carol');
      await request(server).get('/api/admin/events').set('Cookie', plain).expect(403);
    });

    it('creates events and refuses bad slugs, duplicate slugs, long windows and bad text', async () => {
      const live = await request(server).post('/api/admin/events').set('Cookie', admin).send(base('ntf-live', iso(-HOUR), iso(HOUR))).expect(201);
      const future = await request(server).post('/api/admin/events').set('Cookie', admin).send(base('ntf-future', iso(DAY), iso(2 * DAY))).expect(201);
      liveId = live.body.id;
      futureId = future.body.id;

      await request(server).post('/api/admin/events').set('Cookie', admin).send(base('ntf-live', iso(DAY), iso(2 * DAY))).expect(409);
      await request(server).post('/api/admin/events').set('Cookie', admin).send(base('Bad Slug', iso(DAY), iso(2 * DAY))).expect(400);
      await request(server).post('/api/admin/events').set('Cookie', admin).send(base('ntf-long', iso(DAY), iso(32 * DAY))).expect(400);
      await request(server).post('/api/admin/events').set('Cookie', admin).send({ ...base('ntf-short', iso(DAY), iso(2 * DAY)), text: 'too short' }).expect(400);
      await request(server).post('/api/admin/events').set('Cookie', admin).send(base('ntf-back', iso(2 * DAY), iso(DAY))).expect(400);

      const audit = await prisma.adminAction.findFirst({ where: { action: 'event_create', target: `event:${futureId}` } });
      expect(audit).not.toBeNull();
    });

    it('hides the text until the event starts', async () => {
      const future = (await request(server).get('/api/events/ntf-future').expect(200)).body;
      expect(future).toMatchObject({ slug: 'ntf-future', state: 'upcoming', text: null });
      const live = (await request(server).get('/api/events/ntf-live').expect(200)).body;
      expect(live).toMatchObject({ slug: 'ntf-live', state: 'active', text: TEXT });
      await request(server).get('/api/events/ntf-missing').expect(404);
      await request(server).get('/api/events/ntf-missing/leaderboard').expect(404);
    });

    it('lists upcoming, active and past events publicly, without the text', async () => {
      const listing = (await request(server).get('/api/events').expect(200)).body;
      expect(listing.upcoming.map((e: { slug: string }) => e.slug)).toContain('ntf-future');
      expect(listing.active.map((e: { slug: string }) => e.slug)).toContain('ntf-live');
      expect(Array.isArray(listing.past)).toBe(true);
      expect(listing.past.length).toBeLessThanOrEqual(20);
      for (const bucket of [listing.upcoming, listing.active, listing.past]) {
        for (const event of bucket) expect(event).not.toHaveProperty('text');
      }
    });

    it('applies the started-event rules: text and language fixed, endsAt extend only', async () => {
      await request(server).patch(`/api/admin/events/${liveId}`).set('Cookie', admin).send({ text: 'A brand new text for the live event' }).expect(400);
      await request(server).patch(`/api/admin/events/${liveId}`).set('Cookie', admin).send({ language: 'pl' }).expect(400);
      await request(server).patch(`/api/admin/events/${liveId}`).set('Cookie', admin).send({ endsAt: iso(-HOUR) }).expect(400);
      await request(server).patch(`/api/admin/events/${liveId}`).set('Cookie', admin).send({ slug: 'renamed' }).expect(400);

      const renamed = await request(server).patch(`/api/admin/events/${liveId}`).set('Cookie', admin).send({ title: 'Live, now', endsAt: iso(2 * HOUR) }).expect(200);
      expect(renamed.body).toMatchObject({ title: 'Live, now', state: 'active' });

      // Before the start, the text may change.
      const edited = await request(server).patch(`/api/admin/events/${futureId}`).set('Cookie', admin).send({ text: 'A new text for the future event' }).expect(200);
      expect(edited.body.text).toBe('A new text for the future event');
      const detail = (await request(server).get('/api/events/ntf-future').expect(200)).body;
      expect(detail.text).toBeNull();
    });

    it('serves the event leaderboard publicly: verified results of the event, one best per user', async () => {
      const runner = await prisma.user.create({
        data: { name: 'ntf_board', nameLower: 'ntf_board', email: 'ntf_board@example.com', passwordHash: 'not-used-here', emailVerifiedAt: new Date() },
        select: { id: true },
      });
      for (const [wpm, verified] of [[88, true], [95, false]] as const) {
        await prisma.result.create({
          data: {
            userId: runner.id,
            mode: 'event',
            mode2: 'ntf-live',
            language: 'en',
            wpm,
            rawWpm: wpm + 4,
            accuracy: 98,
            consistency: 90,
            durationMs: 60_000,
            correctChars: 300,
            incorrectChars: 0,
            extraChars: 0,
            missedChars: 0,
            punctuation: false,
            numbers: false,
            verified,
            eventId: liveId,
          },
        });
      }
      const board = await request(server).get('/api/events/ntf-live/leaderboard').expect(200);
      expect(board.body).toEqual([expect.objectContaining({ rank: 1, name: 'ntf_board', wpm: 88 })]);
    });

    it('deletes an event and keeps its results with the event unset', async () => {
      const runner = await makeUser('ntf_runner');
      const resultId = (
        await prisma.result.create({
          data: {
            userId: runner,
            mode: 'event',
            mode2: 'ntf-future',
            language: 'en',
            wpm: 70,
            rawWpm: 75,
            accuracy: 98,
            consistency: 90,
            durationMs: 60_000,
            correctChars: 300,
            incorrectChars: 0,
            extraChars: 0,
            missedChars: 0,
            punctuation: false,
            numbers: false,
            verified: true,
            eventId: futureId,
          },
          select: { id: true },
        })
      ).id;
      await request(server).delete(`/api/admin/events/${futureId}`).set('Cookie', admin).expect(200);
      await request(server).get('/api/events/ntf-future').expect(404);
      const kept = await prisma.result.findUniqueOrThrow({ where: { id: resultId }, select: { eventId: true } });
      expect(kept.eventId).toBeNull();
      expect(await prisma.adminAction.count({ where: { action: 'event_delete', target: `event:${futureId}` } })).toBe(1);
    });

    it('pages the admin list', async () => {
      const page = (await request(server).get('/api/admin/events?page=1&pageSize=1').set('Cookie', admin).expect(200)).body;
      expect(page).toMatchObject({ page: 1, pageSize: 1 });
      expect(page.items).toHaveLength(1);
    });
  });
});
