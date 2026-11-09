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

// Config is read lazily, so setting it before the app is built is enough. A 300 ms countdown keeps the test quick.
applyE2eEnv();
process.env.RACE_COUNTDOWN_MS = '300';

jest.setTimeout(30_000);

const ALLOWED_ORIGIN = 'http://localhost:5173';
const QUOTE = 'Hola mundo';

type Msg = ServerMessage;
type RoomMsg = Extract<ServerMessage, { type: 'room' }>;

/** A ws client that records every message and lets a test wait for the next one matching a predicate. */
class Sock {
  readonly msgs: Msg[] = [];
  private cursor = 0;
  private readonly listeners = new Set<() => void>();
  closeCode: number | null = null;
  readonly closed: Promise<number>;

  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw: Buffer) => {
      this.msgs.push(JSON.parse(raw.toString()) as Msg);
      for (const l of this.listeners) l();
    });
    this.closed = new Promise((resolve) => {
      ws.once('close', (code: number) => {
        this.closeCode = code;
        resolve(code);
      });
    });
  }

  send(obj: unknown): void {
    this.ws.send(JSON.stringify(obj));
  }

  /** Consumes messages up to and including the first one matching pred. */
  until(pred: (m: Msg) => boolean, label: string, ms = 4000): Promise<Msg> {
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
        reject(new Error(`timed out waiting for ${label}; unread: ${JSON.stringify(this.msgs.slice(this.cursor))}`));
      }, ms);
      const done = (): void => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      this.listeners.add(check);
      check();
    });
  }

  error(message: string): Promise<Msg> {
    return this.until((m) => m.type === 'error' && m.message === message, `error "${message}"`);
  }

  joined(): Promise<Msg> {
    return this.until((m) => m.type === 'joined', 'joined');
  }

  room(pred: (room: RoomMsg['room']) => boolean, label: string): Promise<RoomMsg> {
    return this.until((m) => m.type === 'room' && pred(m.room), label) as Promise<RoomMsg>;
  }
}

/** origin null sends no Origin header at all. */
function connect(origin: string | null, cookie?: string, port = 0): Promise<Sock> {
  const headers: Record<string, string> = {};
  if (origin !== null) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/races/ws`, { headers });
  const sock = new Sock(ws);
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(sock));
    ws.once('error', reject);
    // A rejected upgrade (origin) closes with a code, which the test inspects through sock.closed.
    ws.once('unexpected-response', () => reject(new Error('unexpected response')));
  });
}

describe('Races (e2e)', () => {
  let app: INestApplication<App>;
  let port: number;
  const sockets: Sock[] = [];

  const open = async (origin: string | null = ALLOWED_ORIGIN, cookie?: string): Promise<Sock> => {
    const s = await connect(origin, cookie, port);
    sockets.push(s);
    return s;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address();
    port = typeof address === 'object' && address ? address.port : 0;
    await app.get(PrismaService).quote.create({
      data: { language: 'es', text: QUOTE, source: 'e2e', length: QUOTE.length },
    });
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.ws.terminate();
  });

  afterAll(async () => {
    await app.close();
  });

  const createRoom = async (language = 'es'): Promise<string> => {
    const res = await request(app.getHttpServer()).post('/api/races').send({ language }).expect(201);
    return res.body.id as string;
  };

  it('rejects a socket whose Origin is not allowed', async () => {
    const s = await open('https://evil.example');
    expect(await s.closed).toBe(1008);
  });

  it('rejects a socket with no Origin at all', async () => {
    const s = await open(null);
    expect(await s.closed).toBe(1008);
  });

  it('answers "Race not found" for an unknown room, and errors for bad input', async () => {
    const s = await open();
    s.send({ type: 'join', room: 'nope1234', name: 'alice' });
    await s.error('Race not found');

    s.ws.send('{not json');
    await s.error('Invalid JSON');

    s.send({ type: 'teleport' });
    await s.error('Unknown message type');

    s.send({ type: 'join' });
    await s.error('Invalid message');

    s.ws.send(Buffer.from([1, 2, 3]), { binary: true });
    await s.error('Only JSON text messages are accepted');

    s.send({ type: 'join', room: 'x', name: 'y'.repeat(5000) });
    await s.error('Message too large');
  });

  it('plays a race: join, start, progress, finish, places', async () => {
    const id = await createRoom();
    const host = await open();
    const guest = await open();

    host.send({ type: 'join', room: id, name: 'hosty' });
    await host.joined();
    await host.room((r) => r.status === 'lobby' && r.players.length === 1, 'host lobby');

    guest.send({ type: 'join', room: id, name: 'buddy' });
    await guest.joined();
    const lobby = await host.room((r) => r.players.length === 2, 'two players');
    expect(lobby.room.text).toBeNull();
    expect(lobby.room.hostId).toBe(lobby.room.players[0].id);

    host.send({ type: 'start' });
    const counting = await guest.room((r) => r.status === 'countdown', 'countdown');
    expect(counting.room.text).toBe(QUOTE);
    expect(counting.room.startsAt).toEqual(expect.any(Number));

    await guest.room((r) => r.status === 'racing', 'racing');

    host.send({ type: 'progress', chars: QUOTE.length, wpm: 90 });
    guest.send({ type: 'progress', chars: 4, wpm: 40 });
    host.send({ type: 'finish', wpm: 90, accuracy: 100, durationMs: 100 });
    const midway = await guest.room((r) => r.status === 'racing' && r.players[0].finished, 'host finished');
    expect(midway.room.players[0]).toMatchObject({ place: 1, accuracy: 100, wpm: 90 });

    guest.send({ type: 'progress', chars: QUOTE.length, wpm: 80 });
    guest.send({ type: 'finish', wpm: 80, accuracy: 96, durationMs: 100 });
    const done = await host.room((r) => r.status === 'finished', 'finished');
    const places = done.room.players.map((p) => [p.name, p.place]);
    expect(places).toEqual([
      ['guest hosty', 1],
      ['guest buddy', 2],
    ]);
    expect(done.room.players[1]).toMatchObject({ isGuest: true, accuracy: 96 });
  });

  it('refuses a ninth player with "This race is full"', async () => {
    const id = await createRoom();
    for (let i = 0; i < 8; i++) {
      const s = await open();
      s.send({ type: 'join', room: id, name: `full${i}` });
      await s.joined();
    }
    const ninth = await open();
    ninth.send({ type: 'join', room: id, name: 'ninth' });
    await ninth.error('This race is full');
  });

  it('refuses a finish before every character is typed', async () => {
    const id = await createRoom();
    const host = await open();
    host.send({ type: 'join', room: id, name: 'early' });
    await host.joined();
    host.send({ type: 'start' });
    await host.room((r) => r.status === 'racing', 'racing');
    host.send({ type: 'progress', chars: 3, wpm: 30 });
    host.send({ type: 'finish', wpm: 30, accuracy: 100, durationMs: 100 });
    await host.error('Finish rejected: not every character is typed');
  });

  it('identifies a signed-in user from the session cookie', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'race_ident', email: 'race_ident@example.com', password: 'a-good-password' })
      .expect(201);
    const setCookie = reg.headers['set-cookie'];
    const cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];

    const id = await createRoom();
    const s = await open(ALLOWED_ORIGIN, cookie);
    s.send({ type: 'join', room: id, name: 'ignored nick' });
    await s.joined();
    const view = await s.room((r) => r.players.length === 1, 'signed-in player');
    expect(view.room.players[0]).toMatchObject({ name: 'race_ident', isGuest: false });
  });

  it('answers 400 for an unknown language, and for one with no quotes', async () => {
    await request(app.getHttpServer()).post('/api/races').send({ language: 'xx' }).expect(400);
    // Polish has no quotes in this database, so creating a race there is refused.
    await request(app.getHttpServer()).post('/api/races').send({ language: 'pl' }).expect(400);
  });
});
