import { HttpException, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Request } from 'express';
import { WebSocket, type RawData } from 'ws';
import { readSessionUser } from '../auth/jwt-auth.guard';
import { SESSION_COOKIE } from '../auth/auth.service';
import { getEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { BROADCAST_INTERVAL_MS, clientMessageSchema, MAX_FRAME_BYTES, MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND, MAX_STRIKES, RACES_WS_PATH, RaceError, type ClientMessage, type ServerMessage } from './races.protocol';
import { parseCookieHeader } from './session-cookie';
import { RoomService, type RaceUser, type RoomClosedEvent } from './room.service';

/** Per-socket state. The room itself lives in RoomService. */
interface Conn {
  id: string;
  socket: WebSocket;
  identity: Promise<RaceUser | null>;
  /** Messages are handled one at a time, in order, after the identity is known. */
  queue: Promise<void>;
  closed: boolean;
  windowStart: number;
  windowCount: number;
  windowExcess: boolean;
  strikes: number;
}

interface RoomSend {
  last: number;
  timer: NodeJS.Timeout | null;
}

/** Socket buffers above this are a client that stopped reading. */
const MAX_BUFFERED_BYTES = 256 * 1024;
const KNOWN_TYPES = new Set(['join', 'start', 'progress', 'finish', 'leave']);

/**
 * The races WebSocket. Speaks the SPEC-2.2 protocol: JSON text frames with a `type` field.
 * The adapter's own { event, data } parsing is not used: every message is parsed here.
 */
@WebSocketGateway({ path: RACES_WS_PATH, maxPayload: MAX_FRAME_BYTES })
export class RacesGateway implements OnModuleInit, OnModuleDestroy, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RacesGateway.name);
  private readonly allowedOrigins = new Set(getEnv().corsOrigins);
  private readonly conns = new Map<WebSocket, Conn>();
  private readonly connsById = new Map<string, Conn>();
  private readonly sends = new Map<string, RoomSend>();
  private readonly onChanged = (roomId: string): void => this.scheduleBroadcast(roomId);
  private readonly onClosed = (event: RoomClosedEvent): void => this.notifyClosed(event);

  constructor(
    private readonly rooms: RoomService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.rooms.on('changed', this.onChanged);
    this.rooms.on('closed', this.onClosed);
  }

  onModuleDestroy(): void {
    this.rooms.off('changed', this.onChanged);
    this.rooms.off('closed', this.onClosed);
    for (const send of this.sends.values()) {
      if (send.timer) clearTimeout(send.timer);
    }
    this.sends.clear();
  }

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    // The adapter upgrades before any check of ours, so the origin is checked here.
    // A cross-site page can open a socket to this path, but it cannot choose its Origin header.
    const origin = request.headers.origin;
    if (!origin || !this.allowedOrigins.has(origin)) {
      client.close(1008, 'Origin not allowed');
      return;
    }
    const conn: Conn = {
      id: randomUUID(),
      socket: client,
      identity: this.resolveUser(request),
      queue: Promise.resolve(),
      closed: false,
      windowStart: Date.now(),
      windowCount: 0,
      windowExcess: false,
      strikes: 0,
    };
    this.conns.set(client, conn);
    this.connsById.set(conn.id, conn);
    client.on('message', (data: RawData, isBinary: boolean) => this.onRaw(conn, data, isBinary));
    client.on('error', (err: Error) => this.logger.debug(`socket error: ${err.message}`));
  }

  handleDisconnect(client: WebSocket): void {
    const conn = this.conns.get(client);
    if (!conn) return;
    this.conns.delete(client);
    this.connsById.delete(conn.id);
    conn.closed = true;
    this.rooms.disconnect(conn.id);
  }

  private async resolveUser(request: IncomingMessage): Promise<RaceUser | null> {
    const token = parseCookieHeader(request.headers.cookie, SESSION_COOKIE);
    if (!token) return null;
    // readSessionUser reads the token from req.cookies, so the raw token is passed in that shape.
    const req = { cookies: { [SESSION_COOKIE]: token } } as unknown as Request;
    try {
      return await readSessionUser(req, this.jwt, this.prisma);
    } catch {
      return null;
    }
  }

  private onRaw(conn: Conn, data: RawData, isBinary: boolean): void {
    if (!this.admit(conn)) return;
    const buf = toBuffer(data);
    if (buf.length > MAX_MESSAGE_BYTES) {
      this.sendTo(conn, { type: 'error', message: 'Message too large' });
      return;
    }
    if (isBinary) {
      this.sendTo(conn, { type: 'error', message: 'Only JSON text messages are accepted' });
      return;
    }
    const text = buf.toString('utf8');
    conn.queue = conn.queue
      .then(() => this.handle(conn, text))
      .catch((err: unknown) => this.logger.error(err instanceof Error ? err.stack : String(err)));
  }

  /**
   * Rate limit: MAX_MESSAGES_PER_SECOND per one-second window. Excess messages are dropped. A window
   * with excess is one strike; MAX_STRIKES consecutive strikes close the socket with 1008. A clean
   * window clears the strikes.
   */
  private admit(conn: Conn): boolean {
    if (conn.closed || conn.socket.readyState !== WebSocket.OPEN) return false;
    const now = Date.now();
    if (now - conn.windowStart >= 1000) {
      if (!conn.windowExcess) conn.strikes = 0;
      conn.windowStart = now;
      conn.windowCount = 0;
      conn.windowExcess = false;
    }
    conn.windowCount++;
    if (conn.windowCount <= MAX_MESSAGES_PER_SECOND) return true;
    if (!conn.windowExcess) {
      conn.windowExcess = true;
      conn.strikes++;
    }
    if (conn.strikes >= MAX_STRIKES) conn.socket.close(1008, 'Too many messages');
    return false;
  }

  private async handle(conn: Conn, text: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      this.sendTo(conn, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) {
      const type = typeof json === 'object' && json !== null ? (json as { type?: unknown }).type : undefined;
      const message = typeof type === 'string' && !KNOWN_TYPES.has(type) ? 'Unknown message type' : 'Invalid message';
      this.sendTo(conn, { type: 'error', message });
      return;
    }
    const user = await conn.identity;
    if (conn.closed) return;
    try {
      await this.dispatch(conn, parsed.data, user);
    } catch (err) {
      if (err instanceof RaceError || err instanceof HttpException) {
        this.sendTo(conn, { type: 'error', message: err.message });
      } else {
        this.logger.error(err instanceof Error ? err.stack : String(err));
        this.sendTo(conn, { type: 'error', message: 'Something went wrong. Try again.' });
      }
    }
  }

  private async dispatch(conn: Conn, msg: ClientMessage, user: RaceUser | null): Promise<void> {
    switch (msg.type) {
      case 'join': {
        const playerId = this.rooms.join(msg.room, conn.id, { user, guestName: msg.name });
        this.sendTo(conn, { type: 'joined', you: playerId });
        // The join already scheduled a room update. Scheduling again covers a repeated join.
        this.scheduleBroadcast(msg.room);
        return;
      }
      case 'start':
        await this.rooms.start(conn.id);
        return;
      case 'progress':
        this.rooms.progress(conn.id, msg.chars, msg.wpm);
        return;
      case 'finish':
        this.rooms.finish(conn.id, msg.wpm, msg.accuracy, msg.durationMs);
        return;
      case 'leave':
        this.rooms.leave(conn.id);
        return;
    }
  }

  /** At most one room broadcast per BROADCAST_INTERVAL_MS. Changes inside the window coalesce into one trailing send. */
  private scheduleBroadcast(roomId: string): void {
    let send = this.sends.get(roomId);
    if (!send) {
      send = { last: 0, timer: null };
      this.sends.set(roomId, send);
    }
    if (send.timer) return;
    const wait = Math.max(0, send.last + BROADCAST_INTERVAL_MS - Date.now());
    // A timer even when wait is 0, so a 'joined' reply sent in the same tick goes out first.
    const timer = setTimeout(() => {
      const current = this.sends.get(roomId);
      if (current) current.timer = null;
      this.broadcast(roomId);
    }, wait);
    timer.unref();
    send.timer = timer;
  }

  private broadcast(roomId: string): void {
    const send = this.sends.get(roomId);
    if (send) send.last = Date.now();
    const view = this.rooms.view(roomId);
    if (!view) return;
    const payload = JSON.stringify({ type: 'room', room: view } satisfies ServerMessage);
    for (const connId of this.rooms.memberConnIds(roomId)) {
      const conn = this.connsById.get(connId);
      if (conn) this.sendRaw(conn, payload);
    }
  }

  private notifyClosed(event: RoomClosedEvent): void {
    const send = this.sends.get(event.roomId);
    if (send?.timer) clearTimeout(send.timer);
    this.sends.delete(event.roomId);
    for (const connId of event.connIds) {
      const conn = this.connsById.get(connId);
      if (conn) this.sendTo(conn, { type: 'error', message: 'This race has expired' });
    }
  }

  private sendTo(conn: Conn, msg: ServerMessage): void {
    this.sendRaw(conn, JSON.stringify(msg));
  }

  private sendRaw(conn: Conn, payload: string): void {
    const socket = conn.socket;
    if (socket.readyState !== WebSocket.OPEN) return;
    // A client that stopped reading is cut off rather than buffered without limit.
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.terminate();
      return;
    }
    socket.send(payload, (err) => {
      if (err) this.logger.debug(`send failed: ${err.message}`);
    });
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
