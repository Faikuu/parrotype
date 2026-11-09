import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import WebSocket from 'ws';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ServerMessage } from '../src/races/races.protocol';
import { applyE2eEnv } from './e2e.env';

applyE2eEnv();
process.env.RACE_COUNTDOWN_MS = '300';

jest.setTimeout(30_000);

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'suspension-password-1';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Client {
  ws: WebSocket;
  msgs: ServerMessage[];
  close: { code: number; reason: string } | null;
}

/** Polls until fn returns a truthy value. The race socket tests are asynchronous, so this waits for the effect. */
async function until<T>(fn: () => T | null | undefined | false, label: string, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await sleep(20);
  }
}

const lastRoom = (c: Client) => {
  const rooms = c.msgs.filter((m): m is Extract<ServerMessage, { type: 'room' }> => m.type === 'room');
  return rooms.at(-1)?.room;
};

describe('a suspension closes the account\'s race sockets (e2e)', () => {
  let app: INestApplication<App>;
  let port: number;
  let prisma: PrismaService;
  let admin: string;
  let player: string;
  let roomId: string;
  const clients: Client[] = [];

  const connect = (cookie?: string): Promise<Client> => {
    const headers: Record<string, string> = { Origin: ORIGIN };
    if (cookie) headers.Cookie = cookie;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/races/ws`, { headers });
    const client: Client = { ws, msgs: [], close: null };
    clients.push(client);
    ws.on('message', (raw: Buffer) => client.msgs.push(JSON.parse(raw.toString()) as ServerMessage));
    ws.once('close', (code: number, reason: Buffer) => {
      client.close = { code, reason: reason.toString() };
    });
    return new Promise((resolve, reject) => {
      ws.once('open', () => resolve(client));
      ws.once('error', reject);
    });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address();
    port = typeof address === 'object' && address ? address.port : 0;
    prisma = app.get(PrismaService);

    await prisma.quote.create({ data: { language: 'es', text: 'Hola mundo', source: 'e2e', length: 10 } });
    const reg = async (name: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name, email: `${name}@example.com`, password: PASSWORD })
        .expect(201);
      const header = res.headers['set-cookie'];
      return String(Array.isArray(header) ? header[0] : header).split(';')[0];
    };
    player = await reg('sus_player');
    admin = await reg('sus_admin');
    await prisma.user.update({ where: { nameLower: 'sus_admin' }, data: { role: 'admin' } });
    const created = await request(app.getHttpServer()).post('/api/races').send({ language: 'es' }).expect(201);
    roomId = created.body.id as string;
  });

  afterAll(async () => {
    for (const c of clients) c.ws.terminate();
    await sleep(100);
    await app.close();
  });

  it('closes every socket of a banned player with 1008 "Account suspended", and removes their lobby seat', async () => {
    const tabA = await connect(player);
    const tabB = await connect(player); // a second tab that never joins: still closed by the ban
    tabA.ws.send(JSON.stringify({ type: 'join', room: roomId }));
    await until(() => tabA.msgs.some((m) => m.type === 'joined'), 'player joined');

    const observer = await connect();
    observer.ws.send(JSON.stringify({ type: 'join', room: roomId, name: 'observer' }));
    await until(() => lastRoom(observer)?.players.length === 2, 'two seats in the lobby');

    await request(app.getHttpServer())
      .post('/api/admin/users/sus_player/ban')
      .set('Cookie', admin)
      .send({ reason: 'spam' })
      .expect(200);

    const closedA = await until(() => tabA.close, 'tab A closed');
    expect(closedA).toEqual({ code: 1008, reason: 'Account suspended' });
    expect(await until(() => tabB.close, 'tab B closed')).toEqual({ code: 1008, reason: 'Account suspended' });

    const after = await until(() => (lastRoom(observer)?.players.length === 1 ? lastRoom(observer) : null), 'seat removed');
    expect(after?.players.map((p) => p.name)).toEqual(['guest observer']);
    expect(observer.close).toBeNull();
  });

  it('a socket opened before a ban that landed without an event is closed when it tries to join', async () => {
    await request(app.getHttpServer()).post('/api/admin/users/sus_player/unban').set('Cookie', admin).expect(200);
    // The ban bumped tokenVersion, so the old cookie is dead: sign in again for a fresh session.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'sus_player@example.com', password: PASSWORD })
      .expect(200);
    player = String(login.headers['set-cookie']?.[0] ?? '').split(';')[0];

    const early = await connect(player);
    // Let the connection finish reading its session before the ban below, so it was signed in when it connected.
    await sleep(150);
    // A direct write, with no admin event: only the join re-check can catch this.
    await prisma.user.update({ where: { nameLower: 'sus_player' }, data: { bannedAt: new Date() } });

    early.ws.send(JSON.stringify({ type: 'join', room: roomId }));
    expect(await until(() => early.close, 'early socket closed')).toEqual({ code: 1008, reason: 'Account suspended' });
    expect(early.msgs.some((m) => m.type === 'joined')).toBe(false);

    await prisma.user.update({ where: { nameLower: 'sus_player' }, data: { bannedAt: null } });
  });
});
