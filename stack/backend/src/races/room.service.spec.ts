import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import {
  DISCONNECT_GRACE_MS,
  MAX_PLAYERS,
  MAX_ROOMS,
  MAX_ROOMS_PER_IP,
  MAX_WPM,
  RACE_LIMIT_MS,
  RaceError,
  ROOM_IDLE_TTL_MS,
  UNJOINED_ROOM_TTL_MS,
} from './races.protocol';
import { RoomService, type RoomClosedEvent } from './room.service';

const HELLO = 'hello world'; // 11 chars
const LONG = 'x'.repeat(350); // over the 300 limit, must never be picked
const MAX_LEN = 'y'.repeat(300); // the longest quote the service picks

interface QuoteRow {
  language: string;
  text: string;
  source: string;
  length: number;
}

/** A Prisma stand-in: count and findFirst over an in-memory list, honouring the language and length filters. */
function makePrisma(rows: QuoteRow[]) {
  const matches = (where: { language: string; length: { lte: number } }) =>
    rows.filter((r) => r.language === where.language && r.length <= where.length.lte);
  const count = jest.fn(async ({ where }: { where: { language: string; length: { lte: number } } }) => matches(where).length);
  const findFirst = jest.fn(async ({ where, skip }: { where: { language: string; length: { lte: number } }; skip: number }) => {
    return matches(where)[skip] ?? null;
  });
  return { prisma: { quote: { count, findFirst } } as unknown as PrismaService, count, findFirst };
}

const en = (text: string, source = 'test'): QuoteRow => ({ language: 'en', text, source, length: text.length });
const TOKEN = /^[0-9a-f]{32}$/;

describe('RoomService', () => {
  let clock: { t: number };
  let service: RoomService;
  let quotes: ReturnType<typeof makePrisma>;

  const build = (rows: QuoteRow[] = [en(HELLO, 'hello'), en(LONG, 'long')]) => {
    quotes = makePrisma(rows);
    service = new RoomService(quotes.prisma, { clock: () => clock.t, countdownMs: 3000 });
    service.onModuleInit();
  };

  beforeEach(() => {
    clock = { t: 1_000_000 };
    build();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  /** Creates a room and seats one guest per connection id. The first connection is the host. */
  async function roomWith(...conns: string[]): Promise<string> {
    const id = await service.create('en');
    for (const [i, c] of conns.entries()) {
      service.join(id, c, { user: null, guestName: `player${i}` });
    }
    return id;
  }

  /** Seats one more guest on the given connection. */
  function seat(id: string, connId: string): void {
    service.join(id, connId, { user: null, guestName: `p_${connId}` });
  }

  /** Starts a race with the given connections seated (the first is the host), and moves it to racing. */
  async function running(...conns: string[]): Promise<string> {
    const id = await roomWith(...conns);
    await service.start(conns[0]);
    clock.t += 3000;
    return id;
  }

  describe('create', () => {
    it('picks a quote of at most 300 chars in the language and hides the text in the lobby', async () => {
      const id = await service.create('en');
      expect(quotes.count).toHaveBeenCalledWith({ where: { language: 'en', length: { lte: 300 } } });
      const view = service.view(id);
      expect(view).toMatchObject({ status: 'lobby', text: null, source: null, startsAt: null });
    });

    it('answers 400 when there are no quotes in the language', async () => {
      await expect(service.create('pl')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses new rooms past the cap', async () => {
      for (let i = 0; i < MAX_ROOMS; i++) await service.create('en');
      expect(service.roomCount).toBe(MAX_ROOMS);
      await expect(service.create('en')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('lets one IP hold 20 open rooms, and answers 429 for the 21st', async () => {
      for (let i = 0; i < MAX_ROOMS_PER_IP; i++) await service.create('en', '10.0.0.1');
      const refused = service.create('en', '10.0.0.1');
      await expect(refused).rejects.toBeInstanceOf(HttpException);
      await expect(refused).rejects.toThrow('You have too many open races');
      // Another IP is not affected.
      await expect(service.create('en', '10.0.0.2')).resolves.toEqual(expect.any(String));
    });

    it('frees an IP slot when one of its rooms is removed', async () => {
      for (let i = 0; i < MAX_ROOMS_PER_IP; i++) await service.create('en', '10.0.0.1');
      clock.t += UNJOINED_ROOM_TTL_MS + 1;
      service.sweep();
      expect(service.roomCount).toBe(0);
      await expect(service.create('en', '10.0.0.1')).resolves.toEqual(expect.any(String));
    });

    it('expires a room nobody joined after 2 minutes', async () => {
      const id = await service.create('en');
      clock.t += UNJOINED_ROOM_TTL_MS - 1000;
      service.sweep();
      expect(service.view(id)).not.toBeNull();
      clock.t += 2000;
      service.sweep();
      expect(service.view(id)).toBeNull();
    });

    it('does not apply the 2-minute rule to a room a player has joined', async () => {
      const id = await roomWith('a');
      clock.t += UNJOINED_ROOM_TTL_MS + 1000;
      service.sweep();
      expect(service.view(id)).not.toBeNull();
    });
  });

  describe('join', () => {
    it('answers "Race not found" for an unknown room', () => {
      expect(() => service.join('nope1234', 'c1', { user: null, guestName: 'alice' })).toThrow(
        new RaceError('Race not found'),
      );
    });

    it('validates the guest nickname and prefixes it with "guest "', async () => {
      const id = await service.create('en');
      for (const bad of ['', ' ', 'a', 'bad!name', 'x'.repeat(21)]) {
        expect(() => service.join(id, 'c', { user: null, guestName: bad })).toThrow(
          'Pick a nickname of 2 to 20 letters, digits, underscores or spaces',
        );
      }
      expect(() => service.join(id, 'c', { user: null })).toThrow(RaceError);
      service.join(id, 'c', { user: null, guestName: '  alice  ' });
      const view = service.view(id);
      expect(view?.players[0]).toMatchObject({ name: 'guest alice', isGuest: true, connected: true });
    });

    it('uses the account name for a signed-in user and ignores a guest name', async () => {
      const id = await service.create('en');
      service.join(id, 'c', { user: { id: 7, name: 'typist' }, guestName: 'ignored' });
      expect(service.view(id)?.players[0]).toMatchObject({ name: 'typist', isGuest: false });
    });

    it('allows 8 players and answers "This race is full" for the 9th', async () => {
      const conns = Array.from({ length: MAX_PLAYERS }, (_, i) => `c${i}`);
      const id = await roomWith(...conns);
      expect(service.view(id)?.players).toHaveLength(8);
      expect(() => service.join(id, 'c8', { user: null, guestName: 'late' })).toThrow(
        new RaceError('This race is full'),
      );
    });

    it('a signed-in user who is already seated takes the seat back without using a new one', async () => {
      const id = await service.create('en');
      service.join(id, 'u1', { user: { id: 1, name: 'me' } });
      for (let i = 0; i < 7; i++) seat(id, `g${i}`);
      expect(service.view(id)?.players).toHaveLength(8);

      const again = service.join(id, 'u2', { user: { id: 1, name: 'me' } }).playerId;
      expect(service.view(id)?.players).toHaveLength(8);
      expect(service.view(id)?.players.find((p) => p.id === again)?.connected).toBe(true);
      // The old connection no longer holds the seat.
      expect(() => service.progress('u1', 3, 50)).toThrow(new RaceError('Join a race first'));
    });

    it('returns a 32-hex token with the seat, and a repeated join on the same socket returns the same seat', async () => {
      const id = await service.create('en');
      const first = service.join(id, 'c1', { user: null, guestName: 'alice' });
      expect(first.token).toMatch(TOKEN);
      expect(service.join(id, 'c1', { user: null, guestName: 'alice' })).toEqual(first);
      expect(service.view(id)?.players).toHaveLength(1);
    });

    it('never puts the token in the room view', async () => {
      const id = await roomWith('a');
      const view = JSON.stringify(service.view(id));
      expect(view).not.toMatch(/"token"/);
    });

    it('a new player cannot join once the countdown has started, but a seated player can still reclaim by token', async () => {
      const id = await service.create('en');
      const host = service.join(id, 'host', { user: null, guestName: 'host' });
      await service.start('host');
      expect(() => service.join(id, 'late', { user: null, guestName: 'late' })).toThrow(
        new RaceError('This race has already started'),
      );
      clock.t += 3000;
      expect(() => service.join(id, 'late', { user: null, guestName: 'late' })).toThrow(
        'This race has already started',
      );
      expect(service.join(id, 'host2', { user: null }, host.token).playerId).toBe(host.playerId);
    });

    it('a signed-in user can still reclaim their seat by user id once the race has started', async () => {
      const id = await service.create('en');
      service.join(id, 'u1', { user: { id: 9, name: 'me' } });
      service.join(id, 'x', { user: null, guestName: 'other' });
      await service.start('u1');
      clock.t += 3000;
      const back = service.join(id, 'u2', { user: { id: 9, name: 'me' } });
      expect(service.view(id)?.players.find((p) => p.id === back.playerId)).toMatchObject({ connected: true });
    });

    it('reclaims a seat by token from a new connection, keeping the progress', async () => {
      const id = await service.create('en');
      service.join(id, 'host', { user: null, guestName: 'host' });
      const guest = service.join(id, 'g1', { user: null, guestName: 'gina' });
      await service.start('host');
      clock.t += 3000;
      service.progress('g1', 5, 60);
      service.disconnect('g1');
      expect(service.view(id)?.players.find((p) => p.id === guest.playerId)).toMatchObject({
        connected: false,
        progress: 5 / 11,
      });

      const back = service.join(id, 'g2', { user: null }, guest.token);
      expect(back).toEqual(guest);
      const seated = service.view(id)!.players.find((p) => p.id === guest.playerId)!;
      expect(seated).toMatchObject({ connected: true, progress: 5 / 11 });
      // The new connection now types for the seat.
      service.progress('g2', 7, 60);
      expect(service.view(id)?.players.find((p) => p.id === guest.playerId)?.progress).toBeCloseTo(7 / 11);
    });

    it('treats a token from another room, or an unknown token, as a new join', async () => {
      const first = await service.create('en');
      const other = service.join(first, 'a', { user: null, guestName: 'ann' });
      const second = await service.create('en');
      const joined = service.join(second, 'b', { user: null, guestName: 'bob' }, other.token);
      expect(joined.playerId).not.toBe(other.playerId);
      expect(service.view(second)?.players).toHaveLength(1);
      expect(service.view(first)?.players).toHaveLength(1);
      // An unknown token in the room is also just a new join.
      const third = service.join(second, 'c', { user: null, guestName: 'cy' }, 'f'.repeat(32));
      expect(third.playerId).not.toBe(joined.playerId);
      expect(service.view(second)?.players).toHaveLength(2);
    });
  });

  describe('host and leaving', () => {
    it('hands the host role to the next player when the host leaves', async () => {
      const id = await roomWith('host', 'second', 'third');
      const second = service.view(id)!.players[1].id;
      service.leave('host');
      expect(service.view(id)?.hostId).toBe(second);
    });

    it('removes the room once the last player leaves, and reports it as closed', async () => {
      const closed: RoomClosedEvent[] = [];
      service.on('closed', (e: RoomClosedEvent) => closed.push(e));
      const id = await roomWith('only');
      service.leave('only');
      expect(service.view(id)).toBeNull();
      expect(service.roomCount).toBe(0);
      expect(closed).toEqual([{ roomId: id, connIds: [], reason: 'empty' }]);
    });

    it('releases the seat of a lobby player who disconnects', async () => {
      const id = await roomWith('a', 'b');
      service.disconnect('b');
      expect(service.view(id)?.players).toHaveLength(1);
    });

    it('keeps a disconnected player during a race, marked as not connected', async () => {
      const id = await roomWith('a', 'b');
      await service.start('a');
      clock.t += 3000;
      service.disconnect('b');
      const view = service.view(id)!;
      expect(view.players).toHaveLength(2);
      expect(view.players[1].connected).toBe(false);
    });
  });

  describe('start and the countdown', () => {
    it('only the host can start', async () => {
      await roomWith('host', 'guest');
      await expect(service.start('guest')).rejects.toThrow('Only the host can start the race');
    });

    it('a solo race is allowed, and the countdown reveals the text', async () => {
      const id = await roomWith('solo');
      await service.start('solo');
      const view = service.view(id)!;
      expect(view).toMatchObject({ status: 'countdown', text: HELLO, source: 'hello', startsAt: clock.t + 3000 });
    });

    it('moves to racing once the countdown has passed', async () => {
      const id = await roomWith('a');
      await service.start('a');
      clock.t += 2999;
      expect(service.view(id)?.status).toBe('countdown');
      clock.t += 1;
      expect(service.view(id)?.status).toBe('racing');
    });

    it('rejects a second start while the race is running', async () => {
      await roomWith('a');
      await service.start('a');
      await expect(service.start('a')).rejects.toThrow('The race is already running');
    });
  });

  describe('progress', () => {
    it('is ignored before the race is racing', async () => {
      const id = await roomWith('a');
      await service.start('a');
      service.progress('a', 5, 50);
      expect(service.view(id)?.players[0].progress).toBe(0);
    });

    it('clamps to the text length and only moves forward', async () => {
      const id = await roomWith('a', 'b');
      await service.start('a');
      clock.t += 3000;
      service.progress('a', 50, 80);
      expect(service.view(id)?.players[0].progress).toBe(1);

      service.progress('b', 5, 60);
      service.progress('b', 2, 60);
      expect(service.view(id)?.players[1].progress).toBeCloseTo(5 / 11);
    });

    /** A service whose only quote is the 300-char text, so the pace cap is what limits the progress. */
    async function longRace(): Promise<{ id: string }> {
      service.onModuleDestroy();
      build([en(MAX_LEN, 'max')]);
      const id = await service.create('en');
      service.join(id, 'a', { user: null, guestName: 'ann' });
      await service.start('a');
      clock.t += 3000; // racing, at elapsed 0
      return { id };
    }

    it('caps the characters at the pace the server clock allows (350 wpm plus 15 chars)', async () => {
      const { id } = await longRace();
      // At the start the slack is 15 characters.
      service.progress('a', 300, 0);
      expect(service.view(id)?.players[0].progress).toBeCloseTo(15 / 300);
      // 1 second in: floor(1750 * 1000 / 60000) + 15 = 44.
      clock.t += 1000;
      service.progress('a', 300, 0);
      expect(service.view(id)?.players[0].progress).toBeCloseTo(44 / 300);
      // 60 seconds in: 1765, more than the text, so the text length is the limit.
      clock.t += 59_000;
      service.progress('a', 300, 0);
      expect(service.view(id)?.players[0].progress).toBe(1);
    });

    it('caps the live wpm at the server-implied pace, and at 350', async () => {
      const { id } = await longRace();
      clock.t += 3000; // elapsed 3000

      // 5 chars in 3 s is 20 wpm, so the client's 300 is brought down to 20.
      service.progress('a', 5, 300);
      expect(service.view(id)?.players[0].wpm).toBe(20);
      // A client claim below the implied pace is kept.
      service.progress('a', 5, 10);
      expect(service.view(id)?.players[0].wpm).toBe(10);
      // 102 chars (the cap at 3 s) in 3 s would be 408 wpm, so the 350 limit applies.
      service.progress('a', 300, 500);
      expect(service.view(id)?.players[0]).toMatchObject({ wpm: 350, progress: 102 / 300 });
    });

    it('does not take a wpm above 350 from the client, and keeps the last valid value', async () => {
      const id = await roomWith('a');
      await service.start('a');
      clock.t += 6000; // racing, then 3 s in
      service.progress('a', 3, 400);
      expect(service.view(id)?.players[0].wpm).toBe(12);
      service.progress('a', 4, 120);
      service.progress('a', 5, 400);
      expect(service.view(id)?.players[0].wpm).toBeLessThanOrEqual(MAX_WPM);
    });
  });

  describe('finish', () => {
    it('rejects a finish before every character is typed', async () => {
      await running('a');
      service.progress('a', 10, 80);
      expect(() => service.finish('a', 98)).toThrow('Finish rejected: not every character is typed');
    });

    it('rejects a finish whose server-computed wpm is above 350, including an instant finish', async () => {
      await running('a');
      service.progress('a', 11, 80);
      expect(() => service.finish('a', 98)).toThrow('Finish rejected: too fast');
      // 11 chars in 300 ms is 440 wpm.
      clock.t += 300;
      expect(() => service.finish('a', 98)).toThrow('Finish rejected: too fast');
    });

    it('accepts the first finish that is within the limit, with the server wpm', async () => {
      const id = await running('a');
      service.progress('a', 11, 80);
      clock.t += 300;
      expect(() => service.finish('a', 98)).toThrow('Finish rejected: too fast');
      // 2.2 words in 400 ms is exactly 330 wpm.
      clock.t += 100;
      service.finish('a', 98);
      expect(service.view(id)?.players[0]).toMatchObject({ place: 1, wpm: 330, accuracy: 98 });
    });

    it('computes the wpm and duration on the server, from its own clock', async () => {
      const id = await running('a');
      service.progress('a', 11, 80);
      clock.t += 6000;
      service.finish('a', 98);
      // 2.2 words over 0.1 minute.
      expect(service.view(id)?.players[0]).toMatchObject({ wpm: 22 });
    });

    it('clamps the accuracy to 0-100 and keeps it', async () => {
      const id = await roomWith('a', 'b', 'c');
      await service.start('a');
      clock.t += 3000;
      for (const c of ['a', 'b', 'c']) service.progress(c, 11, 80);
      clock.t += 10_000;
      service.finish('a', 150);
      service.finish('b', -3);
      service.finish('c', 96.5);
      expect(service.view(id)?.players.map((p) => p.accuracy)).toEqual([100, 0, 96.5]);
    });

    it('records places in finish order and ends a solo race', async () => {
      const id = await running('a', 'b');
      service.progress('a', 11, 80);
      service.progress('b', 11, 60);
      clock.t += 10_000;
      service.finish('a', 98);
      expect(service.view(id)).toMatchObject({ status: 'racing' });
      service.finish('b', 95);
      const view = service.view(id)!;
      expect(view.status).toBe('finished');
      expect(view.players.map((p) => [p.place, p.accuracy])).toEqual([
        [1, 98],
        [2, 95],
      ]);
    });

    it('does not let a player finish twice', async () => {
      await running('a');
      service.progress('a', 11, 80);
      clock.t += 10_000;
      service.finish('a', 98);
      expect(() => service.finish('a', 98)).toThrow(RaceError);
    });

    it('does not wait for a disconnected player', async () => {
      const id = await running('a', 'b');
      service.disconnect('b');
      service.progress('a', 11, 80);
      clock.t += 10_000;
      service.finish('a', 98);
      expect(service.view(id)?.status).toBe('finished');
    });

    it('ends after 3 minutes, and players who never finished have no place', async () => {
      const id = await running('a', 'b');
      service.progress('a', 11, 80);
      clock.t += 10_000;
      service.finish('a', 98);
      clock.t += RACE_LIMIT_MS;
      const view = service.view(id)!;
      expect(view.status).toBe('finished');
      expect(view.players.map((p) => p.place)).toEqual([1, null]);
    });
  });

  describe('disconnected players', () => {
    it('removes a disconnected player when the race finishes', async () => {
      const id = await running('a', 'b');
      service.disconnect('b');
      expect(service.view(id)?.players).toHaveLength(2);
      service.progress('a', 11, 80);
      clock.t += 10_000;
      service.finish('a', 98);
      const view = service.view(id)!;
      expect(view.status).toBe('finished');
      expect(view.players.map((p) => p.name)).toEqual(['guest player0']);
    });

    it('removes a disconnected player when the time limit ends the race', async () => {
      const id = await running('a', 'b');
      service.disconnect('b');
      clock.t += RACE_LIMIT_MS;
      const view = service.view(id)!;
      expect(view.status).toBe('finished');
      expect(view.players).toHaveLength(1);
    });

    it('removes a disconnected host, and hands the host role over', async () => {
      const id = await running('a', 'b');
      const bId = service.view(id)!.players[1].id;
      service.disconnect('a');
      clock.t += RACE_LIMIT_MS;
      const view = service.view(id)!;
      expect(view.players.map((p) => p.id)).toEqual([bId]);
      expect(view.hostId).toBe(bId);
    });

    it('removes a player who has not come back within 60 seconds', async () => {
      jest.useFakeTimers();
      try {
        const id = await running('a', 'b');
        const bId = service.view(id)!.players[1].id;
        service.disconnect('b');

        clock.t += DISCONNECT_GRACE_MS - 1000;
        jest.advanceTimersByTime(DISCONNECT_GRACE_MS - 1000);
        expect(service.view(id)?.players.map((p) => p.id)).toContain(bId);

        clock.t += 1000;
        jest.advanceTimersByTime(1000);
        expect(service.view(id)?.players.map((p) => p.id)).not.toContain(bId);
        expect(service.view(id)?.status).toBe('racing');
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps a player who reconnects within 60 seconds, and cancels the timer', async () => {
      jest.useFakeTimers();
      try {
        const id = await service.create('en');
        service.join(id, 'a', { user: null, guestName: 'ann' });
        const b = service.join(id, 'b', { user: null, guestName: 'bea' });
        await service.start('a');
        clock.t += 3000;

        service.disconnect('b');
        clock.t += 30_000;
        jest.advanceTimersByTime(30_000);
        service.join(id, 'b2', { user: null }, b.token);

        clock.t += 60_000;
        jest.advanceTimersByTime(60_000);
        const view = service.view(id)!;
        expect(view.players.map((p) => p.id)).toContain(b.playerId);
        expect(view.players.find((p) => p.id === b.playerId)?.connected).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('a disconnected player in the countdown is removed after the grace period too', async () => {
      jest.useFakeTimers();
      try {
        const id = await roomWith('a', 'b');
        await service.start('a');
        service.disconnect('b');
        clock.t += DISCONNECT_GRACE_MS;
        jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
        expect(service.view(id)?.players).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('clears the grace timers when the room is removed', async () => {
      jest.useFakeTimers();
      try {
        await running('a', 'b');
        const before = jest.getTimerCount();
        service.disconnect('b');
        expect(jest.getTimerCount()).toBe(before + 1);
        // Idle for the whole TTL, so the sweep removes the room, its countdown timer and the grace timer.
        clock.t += ROOM_IDLE_TTL_MS + 1000;
        service.sweep();
        expect(service.roomCount).toBe(0);
        expect(jest.getTimerCount()).toBeLessThan(before);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('restart', () => {
    it('lets the host start again from a new quote, and resets progress and places', async () => {
      const id = await roomWith('a', 'b');
      await service.start('a');
      clock.t += 3000;
      service.progress('a', 11, 80);
      clock.t += 10_000;
      service.finish('a', 98);
      service.disconnect('b');
      expect(service.view(id)?.status).toBe('finished');

      const callsBefore = quotes.count.mock.calls.length;
      await service.start('a');
      expect(quotes.count.mock.calls.length).toBe(callsBefore + 1);
      const view = service.view(id)!;
      expect(view.status).toBe('countdown');
      expect(view.players[0]).toMatchObject({ progress: 0, wpm: 0, finished: false, place: null, accuracy: null });
    });

    it('refuses a restart from anyone but the host', async () => {
      const id = await roomWith('a', 'b');
      await service.start('a');
      clock.t += 3000;
      service.progress('a', 11, 80);
      service.progress('b', 11, 60);
      clock.t += 10_000;
      service.finish('a', 98);
      service.finish('b', 95);
      expect(service.view(id)?.status).toBe('finished');
      await expect(service.start('b')).rejects.toThrow('Only the host can start the race');
    });
  });

  describe('idle sweep', () => {
    it('removes rooms idle longer than the TTL and reports connected players as expired', async () => {
      const closed: RoomClosedEvent[] = [];
      service.on('closed', (e: RoomClosedEvent) => closed.push(e));

      const stale = await roomWith('s1');
      clock.t += ROOM_IDLE_TTL_MS - 1000;
      const fresh = await roomWith('f1');
      clock.t += 2000;

      service.sweep();
      expect(service.view(stale)).toBeNull();
      expect(service.view(fresh)).not.toBeNull();
      expect(closed).toEqual([{ roomId: stale, connIds: ['s1'], reason: 'expired' }]);
    });

    it('counts a join as activity', async () => {
      const id = await roomWith('a');
      clock.t += ROOM_IDLE_TTL_MS - 1000;
      seat(id, 'b');
      clock.t += ROOM_IDLE_TTL_MS - 1000;
      service.sweep();
      expect(service.view(id)).not.toBeNull();
    });
  });
});
