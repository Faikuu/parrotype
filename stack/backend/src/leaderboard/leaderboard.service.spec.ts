import type { PrismaService } from '../prisma/prisma.service';
import { LEADERBOARD_SIZE, LeaderboardService, rankLeaderboard, TIE_EXTRA_MAX, type LeaderboardRow } from './leaderboard.service';

function row(partial: Partial<LeaderboardRow> & { id: number; userId: number; wpm: number }): LeaderboardRow {
  return {
    name: `user${partial.userId}`,
    rawWpm: partial.wpm + 2,
    accuracy: 95,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    verified: true,
    ...partial,
  };
}

describe('rankLeaderboard', () => {
  it('keeps only each user best result', () => {
    const entries = rankLeaderboard([
      row({ id: 1, userId: 1, wpm: 70 }),
      row({ id: 2, userId: 1, wpm: 95 }),
      row({ id: 3, userId: 1, wpm: 80 }),
      row({ id: 4, userId: 2, wpm: 90 }),
    ]);
    expect(entries.map((e) => [e.name, e.wpm])).toEqual([
      ['user1', 95],
      ['user2', 90],
    ]);
  });

  it('breaks wpm ties by the earliest date', () => {
    const entries = rankLeaderboard([
      row({ id: 1, userId: 1, wpm: 88, createdAt: new Date('2026-03-01T00:00:00Z') }),
      row({ id: 2, userId: 2, wpm: 88, createdAt: new Date('2026-02-01T00:00:00Z') }),
    ]);
    expect(entries.map((e) => e.name)).toEqual(['user2', 'user1']);
  });

  it('gives each user the earliest of their own tied best results', () => {
    const entries = rankLeaderboard([
      row({ id: 5, userId: 1, wpm: 88, createdAt: new Date('2026-05-01T00:00:00Z') }),
      row({ id: 6, userId: 1, wpm: 88, createdAt: new Date('2026-04-01T00:00:00Z') }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].createdAt).toBe('2026-04-01T00:00:00.000Z');
  });

  it('sorts by wpm, takes the top 50 and assigns ranks 1..n', () => {
    const rows = Array.from({ length: 60 }, (_, i) => row({ id: i + 1, userId: i + 1, wpm: 50 + i }));
    const entries = rankLeaderboard(rows);
    expect(entries).toHaveLength(LEADERBOARD_SIZE);
    expect(entries[0]).toMatchObject({ rank: 1, name: 'user60', wpm: 109 });
    expect(entries[49]).toMatchObject({ rank: 50, name: 'user11', wpm: 60 });
  });

  it('returns an empty list when there are no results', () => {
    expect(rankLeaderboard([])).toEqual([]);
  });
});

describe('LeaderboardService.top', () => {
  const query = { mode: 'time' as const, mode2: '60', language: 'en' as const };

  function setup(groupBy: jest.Mock, rows: unknown[], users: Array<{ id: number; name: string }>) {
    const prisma = {
      result: { groupBy, findMany: jest.fn().mockResolvedValue(rows) },
      user: { findMany: jest.fn().mockResolvedValue(users) },
    };
    return { service: new LeaderboardService(prisma as unknown as PrismaService), prisma };
  }

  it('reads the best wpm per user with groupBy, then the rows and names once each', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { userId: 1, _max: { wpm: 95 } },
      { userId: 2, _max: { wpm: 90 } },
    ]);
    const rows = [
      { id: 2, userId: 1, wpm: 95, rawWpm: 97, accuracy: 96, createdAt: new Date('2026-02-01T00:00:00Z'), verified: true },
      { id: 4, userId: 2, wpm: 90, rawWpm: 92, accuracy: 95, createdAt: new Date('2026-01-01T00:00:00Z'), verified: false },
    ];
    const { service, prisma } = setup(groupBy, rows, [
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ]);

    const entries = await service.top(query);

    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy.mock.calls[0][0]).toMatchObject({ by: ['userId'], take: LEADERBOARD_SIZE });
    expect(prisma.result.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(entries).toEqual([
      { rank: 1, name: 'alice', wpm: 95, rawWpm: 97, accuracy: 96, createdAt: '2026-02-01T00:00:00.000Z', verified: true, resultId: 2 },
      { rank: 2, name: 'bob', wpm: 90, rawWpm: 92, accuracy: 95, createdAt: '2026-01-01T00:00:00.000Z', verified: false, resultId: 4 },
    ]);
  });

  it('returns an empty list without fetching rows when nothing matches', async () => {
    const { service, prisma } = setup(jest.fn().mockResolvedValue([]), [], []);
    expect(await service.top(query)).toEqual([]);
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });

  it('includes every user tied with the last place, so the earlier date decides the cut', async () => {
    // Users 1..50 have wpm 100..51. User 51 ties the last place (51) with an earlier date.
    const groups = Array.from({ length: LEADERBOARD_SIZE }, (_, i) => ({ userId: i + 1, _max: { wpm: 100 - i } }));
    const tied = { userId: 51, _max: { wpm: 51 } };
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce(groups)
      .mockResolvedValueOnce([...groups, tied]);
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    const rows = [
      ...groups.map((g, i) => ({ id: i + 1, userId: g.userId, wpm: g._max.wpm, rawWpm: g._max.wpm + 2, accuracy: 95, createdAt: day(2) })),
      { id: 99, userId: 51, wpm: 51, rawWpm: 53, accuracy: 95, createdAt: day(1) },
    ];
    const users = [...groups, tied].map((g) => ({ id: g.userId, name: `user${g.userId}` }));
    const { service } = setup(groupBy, rows, users);

    const entries = await service.top(query);

    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(groupBy.mock.calls[1][0]).toMatchObject({ having: { wpm: { _max: { gte: 51 } } } });
    expect(entries).toHaveLength(LEADERBOARD_SIZE);
    expect(entries[LEADERBOARD_SIZE - 1]).toMatchObject({ rank: 50, name: 'user51', wpm: 51 });
    expect(entries.map((e) => e.name)).not.toContain('user50');
  });
});

describe('LeaderboardService.top, daily board', () => {
  const daily = { mode: 'daily' as const, mode2: '2026-11-08', language: 'en' as const };
  const at = (iso: string) => new Date(iso);

  function setup(rows: unknown[]) {
    const groupBy = jest.fn();
    const prisma = {
      result: { groupBy, findMany: jest.fn().mockResolvedValue(rows) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { service: new LeaderboardService(prisma as unknown as PrismaService), prisma, groupBy };
  }

  it("shows each user's first result for the day, so a faster retry does not change the rank", async () => {
    // alice's retry (id 3, 99 wpm) is listed first to show that the order of the rows does not matter.
    const { service, groupBy } = setup([
      { id: 3, userId: 1, wpm: 99, rawWpm: 100, accuracy: 99, createdAt: at('2026-11-08T10:00:00Z'), verified: true, user: { name: 'alice' } },
      { id: 1, userId: 1, wpm: 70, rawWpm: 72, accuracy: 95, createdAt: at('2026-11-08T09:00:00Z'), verified: true, user: { name: 'alice' } },
      { id: 2, userId: 2, wpm: 85, rawWpm: 87, accuracy: 96, createdAt: at('2026-11-08T11:00:00Z'), verified: true, user: { name: 'bob' } },
    ]);

    const entries = await service.top(daily);

    expect(groupBy).not.toHaveBeenCalled();
    expect(entries).toEqual([
      { rank: 1, name: 'bob', wpm: 85, rawWpm: 87, accuracy: 96, createdAt: '2026-11-08T11:00:00.000Z', verified: true, resultId: 2 },
      { rank: 2, name: 'alice', wpm: 70, rawWpm: 72, accuracy: 95, createdAt: '2026-11-08T09:00:00.000Z', verified: true, resultId: 1 },
    ]);
  });

  it('breaks ties between first results by the earlier createdAt', async () => {
    const { service } = setup([
      { id: 5, userId: 1, wpm: 88, rawWpm: 90, accuracy: 96, createdAt: at('2026-11-08T12:00:00Z'), user: { name: 'late' } },
      { id: 4, userId: 2, wpm: 88, rawWpm: 90, accuracy: 96, createdAt: at('2026-11-08T08:00:00Z'), user: { name: 'early' } },
    ]);
    expect((await service.top(daily)).map((e) => e.name)).toEqual(['early', 'late']);
  });

  it('keeps the earliest of a user first results when the timestamps are equal, by id', async () => {
    const { service } = setup([
      { id: 9, userId: 1, wpm: 60, rawWpm: 62, accuracy: 95, createdAt: at('2026-11-08T08:00:00Z'), user: { name: 'x' } },
      { id: 8, userId: 1, wpm: 50, rawWpm: 52, accuracy: 95, createdAt: at('2026-11-08T08:00:00Z'), user: { name: 'x' } },
    ]);
    const entries = await service.top(daily);
    expect(entries).toEqual([expect.objectContaining({ name: 'x', wpm: 50 })]);
  });
});

describe('LeaderboardService.top, tie query', () => {
  const query = { mode: 'time' as const, mode2: '60', language: 'en' as const };

  it('caps the tie query and reads the candidates with one userId-in and wpm-gte query, no OR list', async () => {
    const groups = Array.from({ length: LEADERBOARD_SIZE }, (_, i) => ({ userId: i + 1, _max: { wpm: 100 - i } }));
    const groupBy = jest.fn().mockResolvedValueOnce(groups).mockResolvedValueOnce(groups);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      result: { groupBy, findMany },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new LeaderboardService(prisma as unknown as PrismaService);

    await service.top(query);

    expect(groupBy.mock.calls[1][0]).toMatchObject({
      having: { wpm: { _max: { gte: 51 } } },
      take: LEADERBOARD_SIZE + TIE_EXTRA_MAX,
    });
    const rowQuery = findMany.mock.calls[0][0];
    expect(rowQuery.where.userId).toEqual({ in: groups.map((g) => g.userId) });
    expect(rowQuery.where.wpm).toEqual({ gte: 51 });
    expect(rowQuery.where).not.toHaveProperty('OR');
  });
});

describe('LeaderboardService visibility and verified filter', () => {
  const query = { mode: 'time' as const, mode2: '60', language: 'en' as const };

  function build() {
    const groupBy = jest.fn().mockResolvedValue([]);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { result: { groupBy, findMany }, user: { findMany: jest.fn().mockResolvedValue([]) } };
    return { service: new LeaderboardService(prisma as unknown as PrismaService), groupBy };
  }

  function buildDaily() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { result: { findMany }, user: { findMany: jest.fn().mockResolvedValue([]) } };
    return { service: new LeaderboardService(prisma as unknown as PrismaService), findMany };
  }

  it('leaves out users whose email is not verified, and banned users', async () => {
    const { service, groupBy } = build();
    await service.top(query);
    expect(groupBy.mock.calls[0][0].where).toMatchObject({
      user: { bannedAt: null, emailVerifiedAt: { not: null } },
    });
  });

  it('keeps only verified results by default and with verified=true, and includes unverified ones with verified=false', async () => {
    const { service, groupBy } = build();
    await service.top({ ...query, verified: true });
    expect(groupBy.mock.calls[0][0].where).toHaveProperty('verified', true);

    const implicit = build();
    await implicit.service.top(query);
    expect(implicit.groupBy.mock.calls[0][0].where).toHaveProperty('verified', true);

    const including = build();
    await including.service.top({ ...query, verified: false });
    expect(including.groupBy.mock.calls[0][0].where).not.toHaveProperty('verified');
  });

  it('the daily board is verified-only too: its first result per user is the first verified one', async () => {
    const { service, findMany } = buildDaily();
    await service.top({ mode: 'daily', mode2: '2026-11-09', language: 'en' });
    expect(findMany.mock.calls[0][0].where).toHaveProperty('verified', true);
  });

  it('builds the event board from verified results of one event, with the same visibility rules', async () => {
    const { service, groupBy } = build();
    await service.eventLeaderboard(7);
    expect(groupBy.mock.calls[0][0].where).toEqual({
      eventId: 7,
      verified: true,
      user: { bannedAt: null, emailVerifiedAt: { not: null } },
    });
  });
});

