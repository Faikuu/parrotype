import { countByDay, dayWindow, startOfUtcDay, STATS_DAYS, windowStart } from './stats';

// 2026-11-09 15:30 UTC.
const NOW = Date.UTC(2026, 10, 9, 15, 30);

describe('dayWindow', () => {
  it('lists 30 UTC days, oldest first, ending on the UTC day of now', () => {
    const days = dayWindow(NOW);
    expect(days).toHaveLength(STATS_DAYS);
    expect(days[0]).toBe('2026-10-11');
    expect(days[STATS_DAYS - 1]).toBe('2026-11-09');
    expect(days).toEqual([...days].sort());
  });

  it('crosses month and year boundaries', () => {
    const days = dayWindow(Date.UTC(2027, 0, 2, 1));
    expect(days[0]).toBe('2026-12-04');
    expect(days[days.length - 1]).toBe('2027-01-02');
  });
});

describe('windowStart and startOfUtcDay', () => {
  it('start at 00:00 UTC', () => {
    expect(windowStart(NOW).toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(startOfUtcDay(NOW).toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });
});

describe('countByDay', () => {
  it('zero-fills every day of the window, in order', () => {
    const counts = countByDay([], NOW);
    expect(counts).toHaveLength(30);
    expect(counts.every((c) => c.count === 0)).toBe(true);
    expect(counts[29]).toEqual({ date: '2026-11-09', count: 0 });
  });

  it('buckets by UTC date: 23:59:59 and 00:00:00 land on different days', () => {
    const times = [
      new Date('2026-11-08T23:59:59.999Z'),
      new Date('2026-11-09T00:00:00.000Z'),
      new Date('2026-11-09T12:00:00.000Z'),
    ];
    const counts = countByDay(times, NOW);
    expect(counts.find((c) => c.date === '2026-11-08')?.count).toBe(1);
    expect(counts.find((c) => c.date === '2026-11-09')?.count).toBe(2);
    expect(counts.reduce((sum, c) => sum + c.count, 0)).toBe(3);
  });

  it('ignores timestamps before the window and after today', () => {
    const counts = countByDay(
      [new Date('2026-10-10T23:59:59.999Z'), new Date('2026-10-11T00:00:00.000Z'), new Date('2026-11-10T00:00:00.000Z')],
      NOW,
    );
    expect(counts[0]).toEqual({ date: '2026-10-11', count: 1 });
    expect(counts.reduce((sum, c) => sum + c.count, 0)).toBe(1);
  });

  it('counts several events on one day', () => {
    const times = Array.from({ length: 5 }, () => new Date('2026-11-01T08:00:00.000Z'));
    const counts = countByDay(times, NOW);
    expect(counts.find((c) => c.date === '2026-11-01')?.count).toBe(5);
  });
});
