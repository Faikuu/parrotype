import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Language } from '../common/domain';
import { PrismaService } from '../prisma/prisma.service';
import { RACE_OPTIONS, type RaceOptions } from './races.config';
import { clampPercent, liveWpm, maxCharsAt, wpmFor } from './race-rules';
import {
  DISCONNECT_GRACE_MS,
  GUEST_NAME_REGEX,
  MAX_PLAYERS,
  MAX_QUOTE_LENGTH,
  MAX_ROOMS,
  MAX_ROOMS_PER_IP,
  MAX_WPM,
  RACE_LIMIT_MS,
  RaceError,
  ROOM_ID_ALPHABET,
  ROOM_ID_LENGTH,
  ROOM_IDLE_TTL_MS,
  SWEEP_INTERVAL_MS,
  UNJOINED_ROOM_TTL_MS,
  type PlayerView,
  type RoomStatus,
  type RoomView,
} from './races.protocol';

/** The signed-in user behind a connection (the shape readSessionUser returns). */
export interface RaceUser {
  id: number;
  name: string;
}

export interface JoinIdentity {
  user: RaceUser | null;
  guestName?: string;
}

/** What a join returns: the seat and the token that reclaims it. The token goes only to the connection that joined. */
export interface JoinResult {
  playerId: string;
  token: string;
}

/** Emitted whenever a room is removed. connIds lists the connections still seated in it. */
export interface RoomClosedEvent {
  roomId: string;
  connIds: string[];
  reason: 'expired' | 'empty';
}

interface Player {
  id: string;
  /** Reclaims the seat from any connection, guest or signed in. Never sent in a RoomView. */
  token: string;
  userId: number | null;
  name: string;
  isGuest: boolean;
  /** The connection currently holding this seat, or null while disconnected. */
  connId: string | null;
  connected: boolean;
  chars: number;
  wpm: number;
  finished: boolean;
  place: number | null;
  accuracy: number | null;
  /** Removes a disconnected seat after DISCONNECT_GRACE_MS. Null while connected. */
  graceTimer: NodeJS.Timeout | null;
}

interface Room {
  id: string;
  language: Language;
  status: RoomStatus;
  hostId: string | null;
  text: string;
  source: string;
  startsAt: number | null;
  nextPlace: number;
  players: Player[];
  createdAt: number;
  lastActivity: number;
  /** Set by the first join. A room that never gets one expires after UNJOINED_ROOM_TTL_MS. */
  hasJoined: boolean;
  /** The client IP that created the room, for the per-IP cap. Undefined for creates without one. */
  ownerIp: string | undefined;
  /** True while the host's restart is picking a new quote. Blocks a second start. */
  starting: boolean;
  timer: NodeJS.Timeout | null;
}

interface Membership {
  roomId: string;
  playerId: string;
}

/**
 * In-memory race rooms. Owns the rules: joining, hosts, progress, finishing, places, the
 * countdown and the time limit. It knows nothing about sockets. The gateway passes connection
 * ids in and listens for the events below.
 *
 * Events:
 * - 'changed' (roomId): the room's state changed. The gateway broadcasts it (throttled).
 * - 'closed' (RoomClosedEvent): a room was removed (idle, never joined, or its last player left).
 */
@Injectable()
export class RoomService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly memberships = new Map<string, Membership>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RACE_OPTIONS) private readonly options: RaceOptions,
  ) {
    super();
  }

  onModuleInit(): void {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const room of this.rooms.values()) {
      this.clearTimer(room);
      for (const p of room.players) this.cancelGrace(p);
    }
    this.rooms.clear();
    this.memberships.clear();
  }

  /**
   * Creates a lobby with a random quote in the language. Returns the room id. With an ownerIp,
   * the IP may hold at most MAX_ROOMS_PER_IP open rooms at once.
   */
  async create(language: Language, ownerIp?: string): Promise<string> {
    this.assertRoomAllowed(ownerIp);
    const quote = await this.pickQuote(language);
    if (this.rooms.size >= MAX_ROOMS) this.sweep();
    this.assertRoomAllowed(ownerIp);
    if (this.rooms.size >= MAX_ROOMS) {
      throw new ServiceUnavailableException('Too many races are running. Try again in a few minutes.');
    }
    const id = this.newRoomId();
    const now = this.now();
    this.rooms.set(id, {
      id,
      language,
      status: 'lobby',
      hostId: null,
      text: quote.text,
      source: quote.source,
      startsAt: null,
      nextPlace: 1,
      players: [],
      createdAt: now,
      lastActivity: now,
      hasJoined: false,
      ownerIp,
      starting: false,
      timer: null,
    });
    return id;
  }

  /**
   * Adds the connection to a room. A seat is reclaimed, and doesn't count toward the limit, when
   * the join carries the seat's token (any player), or when a signed-in user already holds a seat
   * (from another tab, or after a dropped connection). Reclaiming keeps the progress. A new player
   * can join only while the race is in the lobby or finished.
   */
  join(roomId: string, connId: string, who: JoinIdentity, token?: string): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) throw new RaceError('Race not found');
    if (!this.advance(room)) throw new RaceError('Race not found');

    const current = this.memberships.get(connId);
    if (current) {
      const own = room.players.find((p) => p.id === current.playerId);
      if (current.roomId === roomId && own) return { playerId: own.id, token: own.token };
      if (current.roomId !== roomId) this.leave(connId);
    }

    const seat =
      (token !== undefined ? room.players.find((p) => p.token === token) : undefined) ??
      (who.user ? room.players.find((p) => p.userId === who.user?.id) : undefined);
    if (seat) return this.reclaim(room, seat, connId);

    if (room.status === 'countdown' || room.status === 'racing') {
      throw new RaceError('This race has already started');
    }
    if (room.players.length >= MAX_PLAYERS) throw new RaceError('This race is full');

    let name: string;
    let isGuest: boolean;
    if (who.user) {
      name = who.user.name;
      isGuest = false;
    } else {
      const nick = (who.guestName ?? '').trim();
      if (!GUEST_NAME_REGEX.test(nick)) {
        throw new RaceError('Pick a nickname of 2 to 20 letters, digits, underscores or spaces');
      }
      name = `guest ${nick}`;
      isGuest = true;
    }

    const player: Player = {
      id: randomBytes(8).toString('hex'),
      token: randomBytes(16).toString('hex'),
      userId: who.user?.id ?? null,
      name,
      isGuest,
      connId,
      connected: true,
      chars: 0,
      wpm: 0,
      finished: false,
      place: null,
      accuracy: null,
      graceTimer: null,
    };
    room.players.push(player);
    room.hostId ??= player.id;
    room.hasJoined = true;
    this.memberships.set(connId, { roomId, playerId: player.id });
    this.touch(room);
    return { playerId: player.id, token: player.token };
  }

  /** The connection leaves its room. The room is removed when nobody is left in it. */
  leave(connId: string): void {
    const m = this.memberships.get(connId);
    if (!m) return;
    this.memberships.delete(connId);
    const room = this.rooms.get(m.roomId);
    if (!room) return;
    const seat = room.players.find((p) => p.id === m.playerId);
    if (seat) this.removePlayer(room, seat);
    this.afterRemoval(room);
  }

  /**
   * The socket closed. In a lobby or after a finish the seat is released. During a countdown or a
   * race the seat stays (disconnected) so the player can reconnect and keep their progress. It is
   * removed if they haven't come back within DISCONNECT_GRACE_MS.
   */
  disconnect(connId: string): void {
    const m = this.memberships.get(connId);
    if (!m) return;
    this.memberships.delete(connId);
    const room = this.rooms.get(m.roomId);
    if (!room) return;
    if (!this.advance(room)) return;
    const seat = room.players.find((p) => p.id === m.playerId);
    if (!seat) return;
    seat.connId = null;
    seat.connected = false;
    if (room.status === 'lobby' || room.status === 'finished') {
      this.removePlayer(room, seat);
      this.afterRemoval(room);
      return;
    }
    this.armGrace(room, seat);
    this.checkFinish(room);
    this.touch(room);
  }

  /** Host only. Starts the countdown. A finished room restarts with a new quote. */
  async start(connId: string): Promise<void> {
    const { room, player } = this.locate(connId);
    if (!this.advance(room)) throw new RaceError('Race not found');
    if (room.hostId !== player.id) throw new RaceError('Only the host can start the race');
    if (room.status !== 'lobby' && room.status !== 'finished') {
      throw new RaceError('The race is already running');
    }
    if (room.starting) throw new RaceError('The race is already running');

    if (room.status === 'finished') {
      room.starting = true;
      let quote: { text: string; source: string };
      try {
        quote = await this.pickQuote(room.language);
      } finally {
        room.starting = false;
      }
      // Anything may have happened while the quote was loading.
      if (this.rooms.get(room.id) !== room) throw new RaceError('Race not found');
      if (room.status !== 'finished' || room.hostId !== player.id) {
        throw new RaceError('The race is already running');
      }
      room.text = quote.text;
      room.source = quote.source;
    }

    const now = this.now();
    this.dropDisconnected(room);
    room.status = 'countdown';
    room.startsAt = now + this.options.countdownMs;
    room.nextPlace = 1;
    for (const p of room.players) {
      p.chars = 0;
      p.wpm = 0;
      p.finished = false;
      p.place = null;
      p.accuracy = null;
    }
    this.arm(room);
    this.touch(room);
  }

  /**
   * Records the typed characters. Only moves forward, and is capped at what the server clock allows
   * for the time since the start (maxCharsAt). The live wpm is capped by that same pace. Both are
   * clamped, not rejected.
   */
  progress(connId: string, chars: number, wpm: number): void {
    const { room, player } = this.locate(connId);
    if (!this.advance(room)) throw new RaceError('Race not found');
    if (room.status !== 'racing' || player.finished || room.startsAt === null) return;
    const elapsed = this.now() - room.startsAt;
    player.chars = Math.max(player.chars, Math.min(chars, room.text.length, maxCharsAt(elapsed)));
    player.wpm = liveWpm(wpm, player.chars, elapsed);
    this.touch(room);
  }

  /**
   * Accepts a finish when every character is typed and the server-computed pace is at most MAX_WPM.
   * The duration and wpm are the server's own: now - startsAt, and (text length / 5) per minute.
   * The client's claimed wpm and durationMs are not read. The accuracy is clamped to 0-100 and kept.
   */
  finish(connId: string, accuracy: number): void {
    const { room, player } = this.locate(connId);
    if (!this.advance(room)) throw new RaceError('The race is not running');
    if (room.status !== 'racing' || room.startsAt === null) throw new RaceError('The race is not running');
    if (player.finished) throw new RaceError('You have already finished');
    if (player.chars !== room.text.length) {
      throw new RaceError('Finish rejected: not every character is typed');
    }
    const durationMs = this.now() - room.startsAt;
    const wpm = wpmFor(room.text.length, durationMs);
    if (wpm > MAX_WPM) throw new RaceError('Finish rejected: too fast');

    player.finished = true;
    player.place = room.nextPlace++;
    player.wpm = wpm;
    player.accuracy = clampPercent(accuracy);
    player.chars = room.text.length;
    this.checkFinish(room);
    this.touch(room);
  }

  /** The current view of a room (advances the clock-driven states first). Null when it doesn't exist. */
  view(roomId: string): RoomView | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (!this.advance(room)) return null;
    return this.toView(room);
  }

  /** Connections seated in a room, for the gateway to send to. */
  memberConnIds(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.players.flatMap((p) => (p.connId ? [p.connId] : []));
  }

  /**
   * Removes rooms that never got a joined player after UNJOINED_ROOM_TTL_MS, and rooms idle for
   * longer than ROOM_IDLE_TTL_MS. Called every minute, and when the room cap is hit.
   */
  sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (!room.hasJoined && now - room.createdAt > UNJOINED_ROOM_TTL_MS) {
        this.removeRoom(room, 'expired');
        continue;
      }
      if (now - room.lastActivity > ROOM_IDLE_TTL_MS) this.removeRoom(room, 'expired');
    }
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private now(): number {
    return this.options.clock();
  }

  private openRoomsFor(ip: string): number {
    let count = 0;
    for (const room of this.rooms.values()) if (room.ownerIp === ip) count++;
    return count;
  }

  private assertRoomAllowed(ownerIp: string | undefined): void {
    if (ownerIp !== undefined && this.openRoomsFor(ownerIp) >= MAX_ROOMS_PER_IP) {
      throw new HttpException('You have too many open races', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private locate(connId: string): { room: Room; player: Player } {
    const m = this.memberships.get(connId);
    const room = m ? this.rooms.get(m.roomId) : undefined;
    const player = room?.players.find((p) => p.id === m?.playerId);
    if (!room || !player) throw new RaceError('Join a race first');
    return { room, player };
  }

  /** Takes a seat back: the connection replaces the old one and the progress stays. */
  private reclaim(room: Room, seat: Player, connId: string): JoinResult {
    if (seat.connId) this.memberships.delete(seat.connId);
    seat.connId = connId;
    seat.connected = true;
    this.cancelGrace(seat);
    this.memberships.set(connId, { roomId: room.id, playerId: seat.id });
    room.hasJoined = true;
    this.touch(room);
    return { playerId: seat.id, token: seat.token };
  }

  /**
   * Applies the clock-driven transitions: countdown to racing, and racing to finished after the time
   * limit. Returns false when the room was removed on the way (no connected player was left).
   */
  private advance(room: Room): boolean {
    const now = this.now();
    if (room.status === 'countdown' && room.startsAt !== null && now >= room.startsAt) {
      room.status = 'racing';
    }
    if (room.status === 'racing' && room.startsAt !== null && now >= room.startsAt + RACE_LIMIT_MS) {
      this.finishRace(room);
    }
    return this.rooms.get(room.id) === room;
  }

  /** The race ends when every connected player has finished. Disconnected players don't hold it up. */
  private checkFinish(room: Room): void {
    if (room.status !== 'racing') return;
    const connected = room.players.filter((p) => p.connected);
    if (connected.length > 0 && connected.every((p) => p.finished)) this.finishRace(room);
  }

  /** Ends the race and drops the players who are still disconnected. A room with nobody left is removed. */
  private finishRace(room: Room): void {
    room.status = 'finished';
    this.clearTimer(room);
    this.dropDisconnected(room);
    if (room.players.length === 0) this.removeRoom(room, 'empty');
  }

  /** Removes every disconnected seat (and its grace timer). The host moves on if the host was one of them. */
  private dropDisconnected(room: Room): void {
    const gone = room.players.filter((p) => !p.connected);
    if (gone.length === 0) return;
    for (const p of gone) this.cancelGrace(p);
    room.players = room.players.filter((p) => p.connected);
    if (!room.players.some((p) => p.id === room.hostId)) {
      room.hostId = room.players[0]?.id ?? null;
    }
  }

  /** Starts the grace period for a seat that disconnected during a countdown or a race. */
  private armGrace(room: Room, seat: Player): void {
    this.cancelGrace(seat);
    const timer = setTimeout(() => this.onGraceExpired(room.id, seat.id), DISCONNECT_GRACE_MS);
    timer.unref();
    seat.graceTimer = timer;
  }

  private onGraceExpired(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const seat = room.players.find((p) => p.id === playerId);
    if (!seat) return;
    seat.graceTimer = null;
    if (seat.connected) return;
    if (!this.advance(room)) return;
    this.removePlayer(room, seat);
    this.afterRemoval(room);
  }

  private cancelGrace(seat: Player): void {
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
  }

  /** Drops a seat from its room, with its grace timer. */
  private removePlayer(room: Room, seat: Player): void {
    this.cancelGrace(seat);
    room.players = room.players.filter((p) => p.id !== seat.id);
  }

  /** Arms one timer for the next clock-driven transition (countdown end, or the time limit). */
  private arm(room: Room): void {
    this.clearTimer(room);
    if (room.startsAt === null) return;
    let at: number | null = null;
    if (room.status === 'countdown') at = room.startsAt;
    if (room.status === 'racing') at = room.startsAt + RACE_LIMIT_MS;
    if (at === null) return;
    const timer = setTimeout(() => this.onTimer(room.id), Math.max(0, at - this.now()));
    timer.unref();
    room.timer = timer;
  }

  private onTimer(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.timer = null;
    if (!this.advance(room)) return;
    this.arm(room);
    this.emit('changed', roomId);
  }

  private clearTimer(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  }

  private touch(room: Room): void {
    room.lastActivity = this.now();
    this.emit('changed', room.id);
  }

  /** After a seat was released: remove an empty room, otherwise move the host and re-check the finish. */
  private afterRemoval(room: Room): void {
    if (room.players.length === 0) {
      this.removeRoom(room, 'empty');
      return;
    }
    if (!room.players.some((p) => p.id === room.hostId)) room.hostId = room.players[0].id;
    this.checkFinish(room);
    this.touch(room);
  }

  private removeRoom(room: Room, reason: RoomClosedEvent['reason']): void {
    this.clearTimer(room);
    const connIds: string[] = [];
    for (const p of room.players) {
      this.cancelGrace(p);
      if (p.connId) {
        connIds.push(p.connId);
        this.memberships.delete(p.connId);
      }
    }
    this.rooms.delete(room.id);
    const event: RoomClosedEvent = { roomId: room.id, connIds, reason };
    this.emit('closed', event);
  }

  /** The public view. Seat tokens are left out: they are sent only to the connection that took the seat. */
  private toView(room: Room): RoomView {
    const length = room.text.length;
    const players: PlayerView[] = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isGuest: p.isGuest,
      progress: length > 0 ? p.chars / length : 0,
      wpm: p.wpm,
      finished: p.finished,
      place: p.place,
      accuracy: p.accuracy,
      connected: p.connected,
    }));
    const hidden = room.status === 'lobby';
    return {
      id: room.id,
      language: room.language,
      status: room.status,
      hostId: room.hostId ?? '',
      text: hidden ? null : room.text,
      source: hidden ? null : room.source,
      startsAt: room.startsAt,
      players,
    };
  }

  private async pickQuote(language: Language): Promise<{ text: string; source: string }> {
    const where = { language, length: { lte: MAX_QUOTE_LENGTH } };
    const total = await this.prisma.quote.count({ where });
    const none = 'No quotes are available in this language';
    if (total === 0) throw new BadRequestException(none);
    const quote = await this.prisma.quote.findFirst({
      where,
      orderBy: { id: 'asc' },
      skip: randomInt(total),
      select: { text: true, source: true },
    });
    if (!quote) throw new BadRequestException(none);
    return quote;
  }

  private newRoomId(): string {
    for (;;) {
      let id = '';
      for (let i = 0; i < ROOM_ID_LENGTH; i++) {
        id += ROOM_ID_ALPHABET[randomInt(ROOM_ID_ALPHABET.length)];
      }
      if (!this.rooms.has(id)) return id;
    }
  }
}
