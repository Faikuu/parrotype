import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import WebSocket from 'ws';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ServerMessage } from '../src/races/races.protocol';
import { applyE2eEnv } from './e2e.env';
import { sessionFor } from './e2e.helpers';

applyE2eEnv();
process.env.RACE_MAX_SOCKETS_PER_IP = '12';
process.env.RACE_JOIN_TIMEOUT_MS = '5000';

jest.setTimeout(30_000);

/**
 * Quotes (CRUD, the last-quote guard, the permissions) and live races (the list, and a moderator's close that
 * reaches the members' sockets). Permission groups are made in the database; the database is shared with the other
 * e2e files, so the quote tests use the 'de' language alone and clear it first.
 */

const ALLOWED_ORIGIN = 'http://localhost:5173';
const STAMP = `qc${Date.now().toString(36)}`;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A ws client that records its messages and its close, for waiting on a moderator's close. */
class Sock {
  readonly msgs: ServerMessage[] = [];
  private cursor = 0;
  private readonly listeners = new Set<() => void>();
  readonly closed: Promise<{ code: number; reason: string }>;

  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw: Buffer) => {
      this.msgs.push(JSON.parse(raw.toString()) as ServerMessage);
      for (const l of this.listeners) l();
    });
    this.closed = new Promise((resolve) => {
      ws.once('close', (code: number, reason: Buffer) => resolve({ code, reason: reason.toString() }));
    });
  }

  send(obj: unknown): void {
    this.ws.send(JSON.stringify(obj));
  }

  until(pred: (m: ServerMessage) => boolean, label: string, ms = 4000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const check = (): void => {
        while (this.cursor < this.msgs.length) {
          const m = this.msgs[this.cursor++];
          if (pred(m)) {
            done();
            resolve(m);
            return;
          }
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`timed out waiting for ${label}`));
      }, ms);
      const done = (): void => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      this.listeners.add(check);
      check();
    });
  }
}

describe('admin quotes and live races (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let port: number;
  let prisma: PrismaService;
  const sockets: Sock[] = [];

  let admin: string;
  let quoteReader: string; // quotes.read only
  let watcher: string; // races.read only
  let plain: string;
  let adminId: number;

  const get = (path: string, cookie?: string) => {
    const req = request(server).get(path);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const send = (method: 'post' | 'patch' | 'delete', path: string, cookie?: string, body?: object) => {
    let req = request(server)[method](path);
    if (cookie) req = req.set('Cookie', cookie);
    return body === undefined ? req : req.send(body);
  };

  async function makeUser(name: string): Promise<number> {
    return (
      await prisma.user.create({
        data: { name, nameLower: name.toLowerCase(), email: `${name.toLowerCase()}@example.com`, passwordHash: 'not-used-here' },
        select: { id: true },
      })
    ).id;
  }

  /** A group with exactly these permissions, and one member. */
  async function memberOf(userName: string, groupName: string, permissions: string[]): Promise<void> {
    const userId = await makeUser(userName);
    const group = await prisma.permissionGroup.create({
      data: { name: groupName, description: 'e2e', permissions: { create: permissions.map((permission) => ({ permission })) } },
      select: { id: true },
    });
    await prisma.userGroup.create({ data: { userId, groupId: group.id } });
  }

  function connect(cookie?: string): Promise<Sock> {
    const headers: Record<string, string> = { Origin: ALLOWED_ORIGIN };
    if (cookie) headers.Cookie = cookie;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/races/ws`, { headers });
    const sock = new Sock(ws);
    sockets.push(sock);
    return new Promise((resolve, reject) => {
      ws.once('open', () => resolve(sock));
      ws.once('error', reject);
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
    const address = (server as unknown as Server).address();
    port = typeof address === 'object' && address ? address.port : 0;
    prisma = app.get(PrismaService);

    // Accounts: an Administrator, one with quotes.read only, one with races.read only, and one with no groups.
    adminId = await makeUser(`${STAMP}_adm`);
    await prisma.userGroup.create({
      data: {
        userId: adminId,
        groupId: (await prisma.permissionGroup.findUniqueOrThrow({ where: { name: 'Administrators' }, select: { id: true } })).id,
      },
    });
    await memberOf(`${STAMP}_qr`, `Quote readers ${STAMP}`, ['quotes.read']);
    await memberOf(`${STAMP}_rw`, `Race watchers ${STAMP}`, ['races.read']);
    await makeUser(`${STAMP}_plain`);
    admin = await sessionFor(app, prisma, `${STAMP}_adm`);
    quoteReader = await sessionFor(app, prisma, `${STAMP}_qr`);
    watcher = await sessionFor(app, prisma, `${STAMP}_rw`);
    plain = await sessionFor(app, prisma, `${STAMP}_plain`);

    // The quote tests own the 'de' language; the race test needs a quote in 'en' to create a room.
    await prisma.quote.deleteMany({ where: { language: 'de' } });
    await prisma.quote.create({
      data: { language: 'en', text: 'Moderators close races that go wrong.', source: 'e2e', length: 39 },
    });
  });

  afterEach(async () => {
    for (const s of sockets.splice(0)) s.ws.terminate();
    await sleep(50);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('quotes', () => {
    const TEXT = '  Der schnelle braune Fuchs springt.  ';
    const TRIMMED = 'Der schnelle braune Fuchs springt.';
    let firstId: number;
    let secondId: number;

    it('answers 401 with no session, reads with quotes.read, and refuses writes without quotes.manage (403)', async () => {
      await get('/api/admin/quotes').expect(401);
      await get('/api/admin/quotes', quoteReader).expect(200);
      await get('/api/admin/quotes', plain).expect(403);

      const denied = await send('post', '/api/admin/quotes', quoteReader, { language: 'de', text: TRIMMED, source: 'Test' }).expect(403);
      expect(denied.body.message).toBe('Missing permission: quotes.manage');
      await send('post', '/api/admin/quotes', plain, { language: 'de', text: TRIMMED, source: 'Test' }).expect(403);
    });

    it('creates a quote with the text and source trimmed and the length computed on the server', async () => {
      const res = await send('post', '/api/admin/quotes', admin, { language: 'de', text: TEXT, source: '  Test Source  ' }).expect(201);
      expect(res.body).toEqual({ id: expect.any(Number), language: 'de', text: TRIMMED, source: 'Test Source', length: TRIMMED.length });
      firstId = res.body.id;
    });

    it('answers 400 for text or source out of range, or an unknown language', async () => {
      await send('post', '/api/admin/quotes', admin, { language: 'de', text: 'x'.repeat(9), source: 'Test' }).expect(400);
      await send('post', '/api/admin/quotes', admin, { language: 'de', text: 'x'.repeat(601), source: 'Test' }).expect(400);
      await send('post', '/api/admin/quotes', admin, { language: 'de', text: 'Long enough text.', source: 'T' }).expect(400);
      await send('post', '/api/admin/quotes', admin, { language: 'de', text: 'Long enough text.', source: 'x'.repeat(121) }).expect(400);
      await send('post', '/api/admin/quotes', admin, { language: 'fr', text: 'Long enough text.', source: 'Test' }).expect(400);
    });

    it('lists the language with paging, and searches the text', async () => {
      const list = (await get('/api/admin/quotes?language=de&q=Fuchs', quoteReader).expect(200)).body;
      expect(list).toMatchObject({ total: 1, page: 1, pageSize: 25 });
      expect(list.items[0]).toMatchObject({ id: firstId, language: 'de' });
      const none = (await get('/api/admin/quotes?language=de&q=nothing-matches', quoteReader).expect(200)).body;
      expect(none.total).toBe(0);
    });

    it('updates the text and recomputes the length; an empty update is a 400', async () => {
      const res = await send('patch', `/api/admin/quotes/${firstId}`, admin, { text: 'Ein neuer, etwas längerer Satz.' }).expect(200);
      expect(res.body).toMatchObject({ id: firstId, length: 'Ein neuer, etwas längerer Satz.'.length });
      await send('patch', `/api/admin/quotes/${firstId}`, admin, {}).expect(400);
      await send('patch', `/api/admin/quotes/${firstId}`, quoteReader, { source: 'Nope' }).expect(403);
    });

    it('refuses to delete the only quote of its language (400), and keeps it', async () => {
      const refused = await send('delete', `/api/admin/quotes/${firstId}`, admin).expect(400);
      expect(refused.body.message).toBe('Each language needs at least one quote');
      expect(await prisma.quote.findUnique({ where: { id: firstId } })).not.toBeNull();
    });

    it('refuses to move the only quote of a language to another language (400)', async () => {
      await send('patch', `/api/admin/quotes/${firstId}`, admin, { language: 'pl' }).expect(400);
      expect((await prisma.quote.findUniqueOrThrow({ where: { id: firstId } })).language).toBe('de');
    });

    it('deletes a quote once another in its language remains', async () => {
      const second = await send('post', '/api/admin/quotes', admin, { language: 'de', text: 'Ein zweiter Satz zum Testen.', source: 'Test' }).expect(201);
      secondId = second.body.id;
      await send('delete', `/api/admin/quotes/${firstId}`, admin).expect(200);
      expect(await prisma.quote.findUnique({ where: { id: firstId } })).toBeNull();
    });

    it('the remaining quote is now the last one: it cannot be deleted or moved', async () => {
      await send('delete', `/api/admin/quotes/${secondId}`, admin).expect(400);
      await send('patch', `/api/admin/quotes/${secondId}`, admin, { language: 'en' }).expect(400);
    });

    it('answers 404 for an unknown quote, on update and on delete', async () => {
      await send('patch', '/api/admin/quotes/999999999', admin, { source: 'Missing' }).expect(404);
      await send('delete', '/api/admin/quotes/999999999', admin).expect(404);
    });

    it('writes an audit row for each change, in the same database', async () => {
      const rows = await prisma.adminAction.findMany({
        where: { target: { in: [`quote:${firstId}`, `quote:${secondId}`] } },
        orderBy: { id: 'asc' },
        select: { action: true, target: true, adminId: true },
      });
      expect(rows.map((r) => r.action)).toEqual(
        expect.arrayContaining(['quote_create', 'quote_update', 'quote_delete', 'quote_create']),
      );
      expect(rows.every((r) => r.adminId === adminId)).toBe(true);
    });
  });

  describe('races', () => {
    it('answers 401 with no session, and 403 without races.read', async () => {
      await get('/api/admin/races').expect(401);
      await get('/api/admin/races', plain).expect(403);
    });

    it('lists live rooms with the player names, and no tokens or ids', async () => {
      const created = await request(server).post('/api/races').send({ language: 'en' }).expect(201);
      const roomId = created.body.id as string;
      const a = await connect();
      const b = await connect();
      a.send({ type: 'join', room: roomId, name: 'closerA' });
      const joinedA = (await a.until((m) => m.type === 'joined', 'joined A')) as Extract<ServerMessage, { type: 'joined' }>;
      b.send({ type: 'join', room: roomId, name: 'closerB' });
      await b.until((m) => m.type === 'joined', 'joined B');

      const res = await get('/api/admin/races', watcher).expect(200);
      const row = (res.body as Array<{ id: string; players: Array<Record<string, unknown>> }>).find((r) => r.id === roomId);
      expect(row).toBeDefined();
      expect(row!.players.map((p) => p.name)).toEqual(['guest closerA', 'guest closerB']);
      expect(Object.keys(row!.players[0]).sort()).toEqual(['connected', 'isGuest', 'name', 'progress']);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(joinedA.token);
      expect(text).not.toContain(joinedA.you);
    });

    it('answers 403 to a close without races.manage, and closes nothing', async () => {
      const created = await request(server).post('/api/races').send({ language: 'en' }).expect(201);
      const roomId = created.body.id as string;
      const seated = await connect();
      seated.send({ type: 'join', room: roomId, name: 'stayput' });
      await seated.until((m) => m.type === 'joined', 'joined');

      const denied = await send('delete', `/api/admin/races/${roomId}`, watcher).expect(403);
      expect(denied.body.message).toBe('Missing permission: races.manage');
      const list = (await get('/api/admin/races', watcher).expect(200)).body as Array<{ id: string }>;
      expect(list.some((r) => r.id === roomId)).toBe(true);
    });

    it('a moderator close tells every connected member and closes their sockets, then the room is gone', async () => {
      const created = await request(server).post('/api/races').send({ language: 'en' }).expect(201);
      const roomId = created.body.id as string;
      const a = await connect();
      const b = await connect();
      a.send({ type: 'join', room: roomId, name: 'doomedA' });
      await a.until((m) => m.type === 'joined', 'joined A');
      b.send({ type: 'join', room: roomId, name: 'doomedB' });
      await b.until((m) => m.type === 'joined', 'joined B');

      await send('delete', `/api/admin/races/${roomId}`, admin).expect(200, { ok: true });

      await a.until((m) => m.type === 'error' && m.message === 'This race was closed by a moderator', 'closed error A');
      await b.until((m) => m.type === 'error' && m.message === 'This race was closed by a moderator', 'closed error B');
      expect(await a.closed).toEqual({ code: 1000, reason: 'Race closed' });
      expect(await b.closed).toEqual({ code: 1000, reason: 'Race closed' });

      const list = (await get('/api/admin/races', watcher).expect(200)).body as Array<{ id: string }>;
      expect(list.some((r) => r.id === roomId)).toBe(false);
      await send('delete', `/api/admin/races/${roomId}`, admin).expect(404);

      const audit = await prisma.adminAction.findFirst({
        where: { action: 'race_close', target: `race:${roomId}` },
        select: { adminId: true },
      });
      expect(audit?.adminId).toBe(adminId);
    });
  });
});
