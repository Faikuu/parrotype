import {
  buildCalendar,
  countDays,
  formatUtcDay,
  levelFor,
  monthLabels,
  quantileThresholds,
  todayUtc,
} from './calendar';

// 2026-11-09 is a Monday.
const TODAY = '2026-11-09';

describe('buildCalendar', () => {
  it('builds 53 Monday-first weeks ending in the week of today', () => {
    const grid = buildCalendar([], TODAY);
    expect(grid).toHaveLength(53);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    // Monday of the first column is 52 weeks before today's Monday.
    expect(grid[0]?.[0]?.date).toBe('2025-11-10');
    expect(grid[52]?.[0]?.date).toBe('2026-11-09');
  });

  it('leaves the days after today empty and counts 365 days for a Monday', () => {
    const grid = buildCalendar([], TODAY);
    expect(grid[52]?.[0]).not.toBeNull();
    expect(grid[52]?.[1]).toBeNull();
    expect(countDays(grid)).toBe(365);
  });

  it('counts 371 days when today is a Sunday', () => {
    expect(countDays(buildCalendar([], '2026-11-15'))).toBe(371);
  });

  it('places activity on the right day and ignores days outside the range', () => {
    const grid = buildCalendar(
      [
        { date: '2026-11-08', tests: 3 },
        { date: '2020-01-01', tests: 9 },
      ],
      TODAY,
    );
    expect(grid[52]?.[6]).toBeNull();
    const sat = grid[51]?.[5];
    expect(sat).toEqual({ date: '2026-11-07', tests: 0, level: 0 });
    const sun = grid[51]?.[6];
    // Only one non-zero day, so every quantile is 3 and it lands in level 1.
    expect(sun).toEqual({ date: '2026-11-08', tests: 3, level: 1 });
    const all = grid.flat().filter((c) => c !== null);
    expect(all.some((c) => c.date === '2020-01-01')).toBe(false);
  });
});

describe('quantileThresholds and levelFor', () => {
  it('uses quartiles of the non-zero counts', () => {
    expect(quantileThresholds([0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual([2, 4, 6]);
  });

  it('returns zeros when there is no activity', () => {
    expect(quantileThresholds([])).toEqual([0, 0, 0]);
    expect(quantileThresholds([0, 0])).toEqual([0, 0, 0]);
  });

  it('maps counts to levels 0-4', () => {
    const t: [number, number, number] = [2, 4, 6];
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((n) => levelFor(n, t))).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
});

describe('monthLabels', () => {
  it('labels the first column of each month, in order', () => {
    const labels = monthLabels(buildCalendar([], TODAY));
    // November starts in column 51 (Monday 2026-11-02); the next column is still November.
    expect(labels.at(-1)).toEqual({ column: 51, month: 10 });
    expect(labels[0]?.column).toBe(0);
    expect(labels.every((l, i) => i === 0 || l.column > labels[i - 1]!.column)).toBe(true);
  });
});

describe('formatting helpers', () => {
  it('formats a UTC day in the UI language', () => {
    expect(formatUtcDay('2026-11-08', 'en')).toBe('Nov 8, 2026');
    expect(formatUtcDay('2026-11-08T23:30:00Z', 'en')).toBe('Nov 8, 2026');
  });

  it('gives today as a UTC date', () => {
    expect(todayUtc(Date.UTC(2026, 10, 9, 23, 59))).toBe('2026-11-09');
  });
});
