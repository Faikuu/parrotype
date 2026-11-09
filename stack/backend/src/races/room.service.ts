import {
  BadRequestException,
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
import {
  GUEST_NAME_REGEX,
  MAX_PLAYERS,
  MAX_QUOTE_LENGTH,
  MAX_ROOMS,
  MAX_WPM,
  RACE_LIMIT_MS,
  RaceError,
  ROOM_ID_ALPHABET,
  ROOM_ID_LENGTH,
  ROOM_IDLE_TTL_MS,
  SWEEP_INTERVAL_MS,
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

/** Emitted when a room is removed while people are still connected to it. */
export interface RoomClosedEvent {
  roomId: string;
  connIds: string[];
  reason: 'expired';
}

interface Player {
  id: string;
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
  lastActivity: number;
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
 * - 'closed' (RoomClosedEvent): a room was removed while people were connected.
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
    for (const room of this.rooms.values()) this.clearTimer(room);
    this.rooms.clear();
    this.memberships.clear();
  }

  /** Creates a lobby with a random quote in the language. Returns the room id. */
  async create(language: Language): Promise<string> {
    const quote = await this.pickQuote(language);
    if (this.rooms.size >= MAX_ROOMS) this.sweep();
    if (this.rooms.size >= MAX_ROOMS) {
      throw new ServiceUnavailableException('Too many races are running. Try again in a few minutes.');
    }
    const id = this.newRoomId();
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
      lastActivity: this.now(),
      starting: false,
      timer: null,
    });
    return id;
  }

  /**
   * Adds the connection to a room. Returns the player id. A signed-in user who is already in the
   * room (from another tab, or after a dropped connection) takes their seat back and doesn't count
   * toward the limit.
   */
  join(roomId: string, connId: string, who: JoinIdentity): string {
    const room = this.rooms.get(roomId);
    if (!room) throw new RaceError('Race not found');
    this.advance(room);

    const current = this.memberships.get(connId);
    if (current) {
      if (current.roomId === roomId) return current.playerId;
      this.leave(connId);
    }

    if (who.user) {
      const seat = room.players.find((p) => p.userId === who.user?.id);
      if (seat) {
        if (seat.connId) this.memberships.delete(seat.connId);
        seat.connId = connId;
        seat.connected = true;
        this.memberships.set(connId, { roomId, playerId: seat.id });
        this.touch(room);
        return seat.id;
      }
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
    };
    room.players.push(player);
    room.hostId ??= player.id;
    this.memberships.set(connId, { roomId, playerId: player.id });
    this.touch(room);
    return player.id;
  }

  /** The connection leaves its room. The room is removed when nobody is left in it. */
  leave(connId: string): void {
    const m = this.memberships.get(connId);
    if (!m) return;
    this.memberships.delete(connId);
    const room = this.rooms.get(m.roomId);
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== m.playerId);
    this.afterRemoval(room);
  }

  /**
   * The socket closed. In a lobby or after a finish the seat is released. During a countdown or a
   * race the seat stays (disconnected) so the player can reconnect and keep their progress.
   */
  disconnect(connId: string): void {
    const m = this.memberships.get(connId);
    if (!m) return;
    this.memberships.delete(connId);
    const room = this.rooms.get(m.roomId);
    if (!room) return;
    this.advance(room);
    const seat = room.players.find((p) => p.id === m.playerId);
    if (!seat) return;
    seat.connId = null;
    seat.connected = false;
    if (room.status === 'lobby' || room.status === 'finished') {
      room.players = room.players.filter((p) => p.id !== seat.id);
      this.afterRemoval(room);
      return;
    }
    this.checkFinish(room);
    this.touch(room);
  }

  /** Host only. Starts the countdown. A finished room restarts with a new quote. */
  async start(connId: string): Promise<void> {
    const { room, player } = this.locate(connId);
    this.advance(room);
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

  /** Records the typed characters. Only moves forward, is clamped to the text, and ignores wpm above the limit. */
  progress(connId: string, chars: number, wpm: number): void {
    const { room, player } = this.locate(connId);
    this.advance(room);
    if (room.status !== 'racing' || player.finished) return;
    player.chars = Math.max(player.chars, Math.min(chars, room.text.length));
    if (wpm <= MAX_WPM) player.wpm = wpm;
    this.touch(room);
  }

  /** Accepts a finish only when every character is typed and the claimed duration fits the server clock. */
  finish(connId: string, wpm: number, accuracy: number, durationMs: number): void {
    const { room, player } = this.locate(connId);
    this.advance(room);
    if (room.status !== 'racing' || room.startsAt === null) throw new RaceError('The race is not running');
    if (player.finished) throw new RaceError('You have already finished');
    if (player.chars !== room.text.length) {
      throw new RaceError('Finish rejected: not every character is typed');
    }
    const elapsed = this.now() - room.startsAt;
    if (elapsed < durationMs - 500) throw new RaceError('Finish rejected: finished too fast');
    if (wpm > MAX_WPM) throw new RaceError('Finish rejected: wpm is above the limit');

    player.finished = true;
    player.place = room.nextPlace++;
    player.wpm = wpm;
    player.accuracy = accuracy;
    player.chars = room.text.length;
    this.checkFinish(room);
    this.touch(room);
  }

  /** The current view of a room (advances the clock-driven states first). Null when it doesn't exist. */
  view(roomId: string): RoomView | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    this.advance(room);
    return this.toView(room);
  }

  /** Connections seated in a room, for the gateway to send to. */
  memberConnIds(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.players.flatMap((p) => (p.connId ? [p.connId] : []));
  }

  /** Removes rooms idle for longer than the TTL. Called every minute, and when the room cap is hit. */
  sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.lastActivity <= ROOM_IDLE_TTL_MS) continue;
      const connIds = room.players.flatMap((p) => (p.connId ? [p.connId] : []));
      this.removeRoom(room);
      if (connIds.length > 0) {
        const event: RoomClosedEvent = { roomId: room.id, connIds, reason: 'expired' };
        this.emit('closed', event);
      }
    }
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private now(): number {
    return this.options.clock();
  }

  private locate(connId: string): { room: Room; player: Player } {
    const m = this.memberships.get(connId);
    const room = m ? this.rooms.get(m.roomId) : undefined;
    const player = room?.players.find((p) => p.id === m?.playerId);
    if (!room || !player) throw new RaceError('Join a race first');
    return { room, player };
  }

  /** Applies the clock-driven transitions: countdown to racing, and racing to finished after the time limit. */
  private advance(room: Room): void {
    const now = this.now();
    if (room.status === 'countdown' && room.startsAt !== null && now >= room.startsAt) {
      room.status = 'racing';
    }
    if (room.status === 'racing' && room.startsAt !== null && now >= room.startsAt + RACE_LIMIT_MS) {
      this.finishRace(room);
    }
  }

  /** The race ends when every connected player has finished. Disconnected players don't hold it up. */
  private checkFinish(room: Room): void {
    if (room.status !== 'racing') return;
    const connected = room.players.filter((p) => p.connected);
    if (connected.length > 0 && connected.every((p) => p.finished)) this.finishRace(room);
  }

  private finishRace(room: Room): void {
    room.status = 'finished';
    this.clearTimer(room);
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
    this.advance(room);
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
      this.removeRoom(room);
      return;
    }
    if (!room.players.some((p) => p.id === room.hostId)) room.hostId = room.players[0].id;
    this.checkFinish(room);
    this.touch(room);
  }

  private removeRoom(room: Room): void {
    this.clearTimer(room);
    for (const p of room.players) {
      if (p.connId) this.memberships.delete(p.connId);
    }
    this.rooms.delete(room.id);
  }

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
