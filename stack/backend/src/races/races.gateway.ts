import { HttpException, Inject, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Request } from 'express';
import { WebSocket, type RawData } from 'ws';
import { readSessionUser } from '../auth/jwt-auth.guard';
import { SESSION_COOKIE } from '../auth/auth.service';
import { getEnv } from '../config/env';
import { UserEvents } from '../common/user-events';
import { PrismaService } from '../prisma/prisma.service';
import { RACE_SOCKET_LIMITS, type RaceSocketLimits } from './races.config';
import {
  BROADCAST_INTERVAL_MS,
  clientMessageSchema,
  MAX_FRAME_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGES_PER_SECOND,
  MAX_SOCKETS_TOTAL,
  MAX_STRIKES,
  RACE_CLOSED_BY_MODERATOR,
  RACES_WS_PATH,
  RaceError,
  type ClientMessage,
  type ServerMessage,
} from './races.protocol';
import { parseCookieHeader } from './session-cookie';
import { clientIp, SocketLimiter } from './socket-limits';
import { RoomService, type RaceUser, type RoomClosedEvent } from './room.service';

/** Per-socket state. The room itself lives in RoomService. */
interface Conn {
  id: string;
  socket: WebSocket;
  /** The client IP the socket was counted under (released on close). */
  ip: string;
  identity: Promise<RaceUser | null>;
  /** The signed-in user once identity has resolved. Null for guests and before resolution. */
  userId: number | null;
  /** Messages are handled one at a time, in order, after the identity is known. */
  queue: Promise<void>;
  closed: boolean;
  windowStart: number;
  windowCount: number;
  windowExcess: boolean;
  strikes: number;
  /** Closes the socket if it has not joined a race in time. Cleared by a successful join. */
  joinTimer: NodeJS.Timeout | null;
  /** Set by each pong. A socket still false at the next ping is terminated. */
  alive: boolean;
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
  private readonly trustProxy = getEnv().trustProxy;
  private readonly limiter: SocketLimiter;
  private readonly conns = new Map<WebSocket, Conn>();
  private readonly connsById = new Map<string, Conn>();
  private readonly sends = new Map<string, RoomSend>();
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly onChanged = (roomId: string): void => this.scheduleBroadcast(roomId);
  private readonly onClosed = (event: RoomClosedEvent): void => this.notifyClosed(event);
  private readonly onBanned = (userId: number): void => this.evictUser(userId);

  constructor(
    private readonly rooms: RoomService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly userEvents: UserEvents,
    @Inject(RACE_SOCKET_LIMITS) private readonly limits: RaceSocketLimits,
  ) {
    this.limiter = new SocketLimiter({ perIp: limits.maxSocketsPerIp, total: MAX_SOCKETS_TOTAL });
  }

  onModuleInit(): void {
    this.rooms.on('changed', this.onChanged);
    this.rooms.on('closed', this.onClosed);
    this.userEvents.on('banned', this.onBanned);
    this.heartbeat = setInterval(() => this.beat(), this.limits.heartbeatMs);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    this.rooms.off('changed', this.onChanged);
    this.rooms.off('closed', this.onClosed);
    this.userEvents.off('banned', this.onBanned);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const send of this.sends.values()) {
      if (send.timer) clearTimeout(send.timer);
    }
    this.sends.clear();
    for (const conn of this.conns.values()) this.clearJoinTimer(conn);
  }

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    // The adapter upgrades before any check of ours, so the origin is checked here.
    // A cross-site page can open a socket to this path, but it cannot choose its Origin header.
    const origin = request.headers.origin;
    if (!origin || !this.allowedOrigins.has(origin)) {
      client.close(1008, 'Origin not allowed');
      return;
    }
    const ip = clientIp(request.headers, request.socket.remoteAddress, this.trustProxy);
    if (!this.limiter.tryAdd(ip)) {
      client.close(1013, 'Too many connections');
      return;
    }
    const conn: Conn = {
      id: randomUUID(),
      socket: client,
      ip,
      identity: Promise.resolve(null),
      userId: null,
      queue: Promise.resolve(),
      closed: false,
      windowStart: Date.now(),
      windowCount: 0,
      windowExcess: false,
      strikes: 0,
      joinTimer: null,
      alive: true,
    };
    conn.identity = this.resolveUser(request).then((user) => {
      conn.userId = user?.id ?? null;
      return user;
    });
    conn.joinTimer = setTimeout(() => this.closeConn(conn, 1008, 'Join timeout'), this.limits.joinTimeoutMs);
    this.conns.set(client, conn);
    this.connsById.set(conn.id, conn);
    client.on('message', (data: RawData, isBinary: boolean) => this.onRaw(conn, data, isBinary));
    client.on('pong', () => {
      conn.alive = true;
    });
    client.on('error', (err: Error) => this.logger.debug(`socket error: ${err.message}`));
  }

  handleDisconnect(client: WebSocket): void {
    const conn = this.conns.get(client);
    if (!conn) return;
    this.conns.delete(client);
    this.connsById.delete(conn.id);
    conn.closed = true;
    this.clearJoinTimer(conn);
    this.limiter.release(conn.ip);
    this.rooms.disconnect(conn.id);
  }

  private clearJoinTimer(conn: Conn): void {
    if (conn.joinTimer) clearTimeout(conn.joinTimer);
    conn.joinTimer = null;
  }

  /** Closes a socket with a code and reason. The close event then releases its slot. */
  private closeConn(conn: Conn, code: number, reason: string): void {
    this.clearJoinTimer(conn);
    if (conn.socket.readyState === WebSocket.OPEN) conn.socket.close(code, reason);
  }

  /** A ban: every open socket of that user is closed, and its seats leave their rooms. */
  private evictUser(userId: number): void {
    for (const conn of [...this.conns.values()]) {
      if (conn.userId === userId) this.evict(conn);
    }
  }

  /**
   * Ends a signed-in socket because its account is suspended. The seat is released through the room
   * service at once (a lobby seat is removed, a race seat is disconnected); the close event later
   * finds nothing left to do.
   */
  private evict(conn: Conn): void {
    conn.closed = true;
    this.clearJoinTimer(conn);
    this.rooms.disconnect(conn.id);
    this.closeConn(conn, 1008, 'Account suspended');
  }

  /** Read on join, so a ban that landed after the socket connected still stops it joining. */
  private async isSuspended(userId: number): Promise<boolean> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { bannedAt: true } });
    return !row || row.bannedAt !== null;
  }

  /** Pings every open socket. One that did not answer the previous ping is terminated. */
  private beat(): void {
    for (const conn of this.conns.values()) {
      if (conn.socket.readyState !== WebSocket.OPEN) continue;
      if (!conn.alive) {
        conn.socket.terminate();
        continue;
      }
      conn.alive = false;
      conn.socket.ping();
    }
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
        if (user && (await this.isSuspended(user.id))) {
          this.evict(conn);
          return;
        }
        // The check above awaited: the socket may have been closed (a ban) in the meantime.
        if (conn.closed) return;
        const joined = this.rooms.join(msg.room, conn.id, { user, guestName: msg.name }, msg.token);
        this.clearJoinTimer(conn);
        this.sendTo(conn, { type: 'joined', you: joined.playerId, token: joined.token });
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
        this.rooms.finish(conn.id, msg.accuracy);
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

  /**
   * A removed room: its members get the reason as an error. After a moderator's close the sockets are
   * closed as well (1000, the room is gone), so the client does not keep the seat.
   */
  private notifyClosed(event: RoomClosedEvent): void {
    const send = this.sends.get(event.roomId);
    if (send?.timer) clearTimeout(send.timer);
    this.sends.delete(event.roomId);
    const moderated = event.reason === 'moderator';
    for (const connId of event.connIds) {
      const conn = this.connsById.get(connId);
      if (!conn) continue;
      this.sendTo(conn, { type: 'error', message: moderated ? RACE_CLOSED_BY_MODERATOR : 'This race has expired' });
      if (moderated) this.endConn(conn, 1000, 'Race closed');
    }
  }

  /** Ends a socket on the server's say-so. Its seat is already gone from RoomService, so nothing else is undone. */
  private endConn(conn: Conn, code: number, reason: string): void {
    conn.closed = true;
    this.clearJoinTimer(conn);
    this.closeConn(conn, code, reason);
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
