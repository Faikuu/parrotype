import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { MAX_PLAYERS, MAX_ROOMS, RACE_LIMIT_MS, RaceError, ROOM_IDLE_TTL_MS } from './races.protocol';
import { RoomService, type RoomClosedEvent } from './room.service';

const HELLO = 'hello world'; // 11 chars
const LONG = 'x'.repeat(350); // over the 300 limit, must never be picked

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

      const again = service.join(id, 'u2', { user: { id: 1, name: 'me' } });
      expect(service.view(id)?.players).toHaveLength(8);
      expect(service.view(id)?.players.find((p) => p.id === again)?.connected).toBe(true);
      // The old connection no longer holds the seat.
      expect(() => service.progress('u1', 3, 50)).toThrow(new RaceError('Join a race first'));
    });
  });

  describe('host and leaving', () => {
    it('hands the host role to the next player when the host leaves', async () => {
      const id = await roomWith('host', 'second', 'third');
      const second = service.view(id)!.players[1].id;
      service.leave('host');
      expect(service.view(id)?.hostId).toBe(second);
    });

    it('removes the room once the last player leaves', async () => {
      const id = await roomWith('only');
      service.leave('only');
      expect(service.view(id)).toBeNull();
      expect(service.roomCount).toBe(0);
    });

    it('releases the seat of a lobby player who disconnects', async () => {
      const id = await roomWith('a', 'b');
      service.disconnect('b');
      expect(service.view(id)?.players).toHaveLength(1);
    });

    it('keeps a disconnected player during a race, marked as not connected', async () => {
      const id = await roomWith('a', 'b');
      service.start('a');
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

    it('does not take wpm above 350, and keeps the last valid value', async () => {
      const id = await roomWith('a');
      await service.start('a');
      clock.t += 3000;
      service.progress('a', 3, 400);
      expect(service.view(id)?.players[0].wpm).toBe(0);
      service.progress('a', 4, 120);
      service.progress('a', 5, 400);
      expect(service.view(id)?.players[0]).toMatchObject({ wpm: 120, progress: 5 / 11 });
    });
  });

  describe('finish', () => {
    async function running(...conns: string[]): Promise<string> {
      const id = await roomWith(...conns);
      await service.start(conns[0]);
      clock.t += 3000;
      return id;
    }

    it('rejects a finish before every character is typed', async () => {
      await running('a');
      service.progress('a', 10, 80);
      expect(() => service.finish('a', 80, 98, 0)).toThrow(
        'Finish rejected: not every character is typed',
      );
    });

    it('rejects a finish that claims more time than the server clock allows', async () => {
      await running('a');
      service.progress('a', 11, 80);
      clock.t += 1000;
      expect(() => service.finish('a', 80, 98, 5000)).toThrow('Finish rejected: finished too fast');
    });

    it('accepts a finish within the 500 ms tolerance', async () => {
      await running('a');
      service.progress('a', 11, 80);
      clock.t += 4500;
      expect(() => service.finish('a', 80, 98, 5000)).not.toThrow();
    });

    it('rejects a wpm above the limit', async () => {
      await running('a');
      service.progress('a', 11, 80);
      clock.t += 10_000;
      expect(() => service.finish('a', 400, 98, 9000)).toThrow('Finish rejected: wpm is above the limit');
    });

    it('records places in finish order and ends a solo race', async () => {
      const id = await running('a', 'b');
      service.progress('a', 11, 80);
      service.progress('b', 11, 60);
      clock.t += 10_000;
      service.finish('a', 80, 98, 9000);
      expect(service.view(id)).toMatchObject({ status: 'racing' });
      service.finish('b', 60, 95, 9000);
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
      service.finish('a', 80, 98, 9000);
      expect(() => service.finish('a', 80, 98, 9000)).toThrow(RaceError);
    });

    it('does not wait for a disconnected player', async () => {
      const id = await running('a', 'b');
      service.disconnect('b');
      service.progress('a', 11, 80);
      clock.t += 10_000;
      service.finish('a', 80, 98, 9000);
      expect(service.view(id)?.status).toBe('finished');
    });

    it('ends after 3 minutes, and players who never finished have no place', async () => {
      const id = await running('a', 'b');
      service.progress('a', 11, 80);
      clock.t += 10_000;
      service.finish('a', 80, 98, 9000);
      clock.t += RACE_LIMIT_MS;
      const view = service.view(id)!;
      expect(view.status).toBe('finished');
      expect(view.players.map((p) => p.place)).toEqual([1, null]);
    });
  });

  describe('restart', () => {
    it('lets the host start again from a new quote, and resets progress and places', async () => {
      const id = await roomWith('a', 'b');
      await service.start('a');
      clock.t += 3000;
      service.progress('a', 11, 80);
      clock.t += 10_000;
      service.finish('a', 80, 98, 9000);
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
      service.finish('a', 80, 98, 9000);
      service.finish('b', 60, 95, 9000);
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
