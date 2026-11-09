import {
  ACTIVITY_DAYS,
  buildInsights,
  computeAchievements,
  computeActivity,
  computeByHour,
  computeHistogram,
  computeStreak,
  type AchievementId,
  type InsightRow,
} from './insights';

const row = (iso: string, overrides: Partial<InsightRow> = {}): InsightRow => ({
  createdAt: new Date(iso),
  mode: 'time',
  mode2: '60',
  language: 'en',
  wpm: 80,
  accuracy: 97,
  correctChars: 300,
  durationMs: 60_000,
  ...overrides,
});

const idsOf = (rows: InsightRow[]): AchievementId[] => computeAchievements(rows).map((a) => a.id);
const unlockOf = (rows: InsightRow[], id: AchievementId): string | undefined =>
  computeAchievements(rows).find((a) => a.id === id)?.unlockedAt;

describe('computeStreak', () => {
  const today = '2026-03-10';

  it('is zero with no days', () => {
    expect(computeStreak([], today)).toEqual({ current: 0, longest: 0 });
  });

  it('counts a single day today as 1 and 1', () => {
    expect(computeStreak(['2026-03-10'], today)).toEqual({ current: 1, longest: 1 });
  });

  it('keeps the current streak when the last active day is yesterday', () => {
    expect(computeStreak(['2026-03-08', '2026-03-09'], today)).toEqual({ current: 2, longest: 2 });
  });

  it('drops the current streak to 0 when the last active day is two days ago', () => {
    expect(computeStreak(['2026-03-07', '2026-03-08'], today)).toEqual({ current: 0, longest: 2 });
  });

  it('measures the longest run across a gap', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-05', '2026-03-06'];
    expect(computeStreak(days, '2026-03-06')).toEqual({ current: 2, longest: 3 });
  });

  it('keeps a long old run as longest even when the current run is short', () => {
    const old = Array.from({ length: 12 }, (_, i) => `2026-02-${String(i + 1).padStart(2, '0')}`);
    expect(computeStreak([...old, '2026-03-07'], today)).toEqual({ current: 0, longest: 12 });
  });

  it('ignores duplicate days and input order', () => {
    expect(computeStreak(['2026-03-10', '2026-03-09', '2026-03-10', '2026-03-09'], today)).toEqual({
      current: 2,
      longest: 2,
    });
  });

  it('joins runs across a month boundary', () => {
    expect(computeStreak(['2026-02-27', '2026-02-28', '2026-03-01'], '2026-03-01')).toEqual({
      current: 3,
      longest: 3,
    });
  });
});

describe('computeActivity', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  it('covers the last 365 UTC days ending today, inclusive', () => {
    expect(ACTIVITY_DAYS).toBe(365);
    const rows = [
      row('2025-11-09T23:59:00Z'), // 366 days back: outside the window
      row('2025-11-10T00:00:00Z'), // the first day of the window
      row('2026-11-09T11:59:00Z'), // today
    ];
    expect(computeActivity(rows, now)).toEqual([
      { date: '2025-11-10', tests: 1 },
      { date: '2026-11-09', tests: 1 },
    ]);
  });

  it('counts tests per day, only for days with tests, ascending', () => {
    const rows = [
      row('2026-11-08T09:00:00Z'),
      row('2026-11-08T18:00:00Z'),
      row('2026-11-06T10:00:00Z'),
    ];
    expect(computeActivity(rows, now)).toEqual([
      { date: '2026-11-06', tests: 1 },
      { date: '2026-11-08', tests: 2 },
    ]);
  });

  it('leaves out results created after now', () => {
    expect(computeActivity([row('2026-11-10T00:00:00Z')], now)).toEqual([]);
  });

  it('is empty with no results', () => {
    expect(computeActivity([], now)).toEqual([]);
  });
});

describe('computeHistogram', () => {
  it('buckets wpm by 10 and keeps only non-empty buckets, ascending', () => {
    const rows = [
      row('2026-01-01T00:00:00Z', { wpm: 0 }),
      row('2026-01-01T00:01:00Z', { wpm: 9.9 }),
      row('2026-01-01T00:02:00Z', { wpm: 10 }),
      row('2026-01-01T00:03:00Z', { wpm: 99.9 }),
      row('2026-01-01T00:04:00Z', { wpm: 100 }),
    ];
    expect(computeHistogram(rows)).toEqual([
      { from: 0, count: 2 },
      { from: 10, count: 1 },
      { from: 90, count: 1 },
      { from: 100, count: 1 },
    ]);
  });

  it('is empty with no results', () => {
    expect(computeHistogram([])).toEqual([]);
  });
});

describe('computeByHour', () => {
  it('returns all 24 UTC hours, with zeros for empty hours', () => {
    const byHour = computeByHour([]);
    expect(byHour).toHaveLength(24);
    expect(byHour[0]).toEqual({ hour: 0, tests: 0, avgWpm: 0 });
    expect(byHour[23]).toEqual({ hour: 23, tests: 0, avgWpm: 0 });
  });

  it('groups by the UTC hour and averages wpm to one decimal', () => {
    const rows = [
      row('2026-01-01T13:05:00Z', { wpm: 80 }),
      row('2026-01-02T13:59:00Z', { wpm: 80 }),
      row('2026-01-03T13:00:00Z', { wpm: 81 }),
      row('2026-01-01T23:30:00Z', { wpm: 60 }),
    ];
    const byHour = computeByHour(rows);
    expect(byHour[13]).toEqual({ hour: 13, tests: 3, avgWpm: 80.3 });
    expect(byHour[23]).toEqual({ hour: 23, tests: 1, avgWpm: 60 });
    expect(byHour[12]).toEqual({ hour: 12, tests: 0, avgWpm: 0 });
  });
});

describe('computeAchievements', () => {
  it('is empty with no results', () => {
    expect(computeAchievements([])).toEqual([]);
  });

  it('unlocks first_test at the first result', () => {
    const rows = [row('2026-01-05T10:00:00Z', { wpm: 10 }), row('2026-01-06T10:00:00Z', { wpm: 10 })];
    expect(computeAchievements(rows)).toEqual([{ id: 'first_test', unlockedAt: '2026-01-05T10:00:00.000Z' }]);
  });

  it('unlocks tests_100 at the 100th result and not before', () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), { wpm: 10 }));
    expect(unlockOf(rows.slice(0, 99), 'tests_100')).toBeUndefined();
    expect(unlockOf(rows, 'tests_100')).toBe(rows[99].createdAt.toISOString());
    expect(unlockOf(rows, 'tests_1000')).toBeUndefined();
  });

  it('unlocks tests_1000 at the 1000th result, taking the earliest by createdAt', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(), { wpm: 10 }));
    // Given out of order, the sort puts it back in time order.
    const shuffled = [...rows].reverse();
    expect(unlockOf(shuffled, 'tests_1000')).toBe(rows[999].createdAt.toISOString());
  });

  it('unlocks each wpm tier at the first result that reaches it', () => {
    const rows = [
      row('2026-01-01T00:00:00Z', { wpm: 59.9 }),
      row('2026-01-02T00:00:00Z', { wpm: 61 }),
      row('2026-01-03T00:00:00Z', { wpm: 150 }),
    ];
    expect(unlockOf(rows, 'wpm_60')).toBe('2026-01-02T00:00:00.000Z');
    expect(unlockOf(rows, 'wpm_80')).toBe('2026-01-03T00:00:00.000Z');
    expect(unlockOf(rows, 'wpm_100')).toBe('2026-01-03T00:00:00.000Z');
    expect(unlockOf(rows, 'wpm_120')).toBe('2026-01-03T00:00:00.000Z');
    expect(unlockOf(rows, 'wpm_150')).toBe('2026-01-03T00:00:00.000Z');
  });

  it('unlocks perfect only at 100% accuracy with at least 125 correct characters', () => {
    expect(idsOf([row('2026-01-01T00:00:00Z', { accuracy: 100, correctChars: 124 })])).not.toContain('perfect');
    expect(idsOf([row('2026-01-01T00:00:00Z', { accuracy: 99.9, correctChars: 300 })])).not.toContain('perfect');
    const rows = [
      row('2026-01-01T00:00:00Z', { accuracy: 100, correctChars: 124 }),
      row('2026-01-02T00:00:00Z', { accuracy: 100, correctChars: 125 }),
    ];
    expect(unlockOf(rows, 'perfect')).toBe('2026-01-02T00:00:00.000Z');
  });

  it('unlocks marathon only for a 120 second time test', () => {
    expect(idsOf([row('2026-01-01T00:00:00Z', { mode: 'time', mode2: '60' })])).not.toContain('marathon');
    expect(idsOf([row('2026-01-01T00:00:00Z', { mode: 'words', mode2: '120' })])).not.toContain('marathon');
    expect(idsOf([row('2026-01-01T00:00:00Z', { mode: 'time', mode2: '120' })])).toContain('marathon');
  });

  it('unlocks polyglot when the fourth catalog language appears, ignoring other languages', () => {
    const rows = [
      row('2026-01-01T00:00:00Z', { language: 'fr' }),
      row('2026-01-02T00:00:00Z', { language: 'en' }),
      row('2026-01-03T00:00:00Z', { language: 'pl' }),
      row('2026-01-04T00:00:00Z', { language: 'de' }),
    ];
    expect(unlockOf(rows, 'polyglot')).toBeUndefined();
    rows.push(row('2026-01-05T00:00:00Z', { language: 'es' }));
    expect(unlockOf(rows, 'polyglot')).toBe('2026-01-05T00:00:00.000Z');
  });

  it('unlocks pangram_hunter at the second language of pangram tests', () => {
    const rows = [
      row('2026-01-01T00:00:00Z', { mode: 'pangram', mode2: '1', language: 'en' }),
      row('2026-01-02T00:00:00Z', { mode: 'pangram', mode2: '1', language: 'en' }),
      row('2026-01-03T00:00:00Z', { mode: 'time', mode2: '60', language: 'pl' }),
    ];
    expect(unlockOf(rows, 'pangram_hunter')).toBeUndefined();
    rows.push(row('2026-01-04T00:00:00Z', { mode: 'pangram', mode2: '3', language: 'pl' }));
    expect(unlockOf(rows, 'pangram_hunter')).toBe('2026-01-04T00:00:00.000Z');
  });

  it('unlocks daily_first at the first daily result', () => {
    const rows = [
      row('2026-01-01T00:00:00Z'),
      row('2026-01-02T08:00:00Z', { mode: 'daily', mode2: '2026-01-02' }),
    ];
    expect(unlockOf(rows, 'daily_first')).toBe('2026-01-02T08:00:00.000Z');
  });

  it('unlocks streak_N at 00:00Z of the day the streak first reached N', () => {
    const rows = [
      row('2026-03-01T09:00:00Z'),
      row('2026-03-02T09:00:00Z'),
      row('2026-03-03T23:59:00Z'),
    ];
    expect(unlockOf(rows, 'streak_3')).toBe('2026-03-03T00:00:00.000Z');
    expect(unlockOf(rows, 'streak_7')).toBeUndefined();
  });

  it('measures streaks across a gap and unlocks streak_7 and streak_30 when reached', () => {
    const day = (offset: number) => new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000).toISOString();
    // Days 0..2, then a gap on day 3, then days 4..33: the second run reaches 7 on day 10 and 30 on day 33.
    const offsets = [0, 1, 2, ...Array.from({ length: 30 }, (_, i) => i + 4)];
    const rows = offsets.map((o) => row(day(o)));
    expect(unlockOf(rows, 'streak_3')).toBe(day(2).slice(0, 10) + 'T00:00:00.000Z');
    expect(unlockOf(rows, 'streak_7')).toBe(day(10).slice(0, 10) + 'T00:00:00.000Z');
    expect(unlockOf(rows, 'streak_30')).toBe(day(33).slice(0, 10) + 'T00:00:00.000Z');
  });

  it('orders the unlocks by time, then by catalog order', () => {
    const rows = [row('2026-01-01T00:00:00Z', { wpm: 150, mode: 'time', mode2: '120' })];
    expect(computeAchievements(rows).map((a) => a.id)).toEqual([
      'first_test',
      'wpm_60',
      'wpm_80',
      'wpm_100',
      'wpm_120',
      'wpm_150',
      'marathon',
    ]);
  });
});

describe('buildInsights', () => {
  it('combines the parts, with the streak measured against now', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const insights = buildInsights([row('2026-03-09T08:00:00Z'), row('2026-03-10T08:00:00Z', { wpm: 65 })], now);
    expect(insights.streak).toEqual({ current: 2, longest: 2 });
    expect(insights.activity).toEqual([
      { date: '2026-03-09', tests: 1 },
      { date: '2026-03-10', tests: 1 },
    ]);
    expect(insights.histogram).toEqual([
      { from: 60, count: 1 },
      { from: 80, count: 1 },
    ]);
    expect(insights.byHour).toHaveLength(24);
    expect(insights.achievements.map((a) => a.id)).toContain('first_test');
  });
});
