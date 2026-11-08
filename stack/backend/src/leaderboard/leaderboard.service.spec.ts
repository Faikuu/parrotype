import { LEADERBOARD_SIZE, rankLeaderboard, type LeaderboardRow } from './leaderboard.service';

function row(partial: Partial<LeaderboardRow> & { id: number; userId: number; wpm: number }): LeaderboardRow {
  return {
    name: `user${partial.userId}`,
    rawWpm: partial.wpm + 2,
    accuracy: 95,
    createdAt: new Date('2026-01-01T00:00:00Z'),
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
