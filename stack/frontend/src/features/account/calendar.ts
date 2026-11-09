import type { ActivityDay } from '@/lib/api/types';

/** Pure helpers for the activity calendar. All dates are UTC YYYY-MM-DD strings. */

export const CALENDAR_WEEKS = 53;
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

/** One day in the grid. `level` is 0 (no tests) to 4 (the busiest quartile). */
export interface CalendarCell {
  date: string;
  tests: number;
  level: number;
}

/** weeks[column][row]: a column is a week, rows run Monday (0) to Sunday (6). Null is a day outside the range. */
export type CalendarGrid = (CalendarCell | null)[][];

export interface MonthLabel {
  column: number;
  /** 0-11 */
  month: number;
}

export function parseDay(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`);
}

export function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's UTC date, the end of the calendar. */
export function todayUtc(now: number = Date.now()): string {
  return formatDay(now);
}

/** Formats a UTC YYYY-MM-DD (or an ISO timestamp, from its date part) for display, e.g. "Nov 8, 2026". */
export function formatUtcDay(value: string, lang: string): string {
  const ymd = value.slice(0, 10);
  const ms = parseDay(ymd);
  if (Number.isNaN(ms)) return value;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(ms));
}

/** Monday = 0 ... Sunday = 6, for a UTC timestamp. */
export function mondayIndex(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

/**
 * The three cut-offs between the five levels, taken as quantiles of the days that have tests:
 * level 1 is at most the first, level 2 at most the second, level 3 at most the third, 4 above.
 */
export function quantileThresholds(counts: readonly number[]): [number, number, number] {
  const sorted = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0];
  const at = (p: number): number => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;
  return [at(0.25), at(0.5), at(0.75)];
}

export function levelFor(tests: number, thresholds: readonly [number, number, number]): number {
  if (tests <= 0) return 0;
  if (tests <= thresholds[0]) return 1;
  if (tests <= thresholds[1]) return 2;
  if (tests <= thresholds[2]) return 3;
  return 4;
}

/**
 * The calendar ending in the week that holds `today`: `weeks` Monday-first columns. Days after
 * today are null, and so are days before the first column. Activity days outside the range are ignored.
 */
export function buildCalendar(
  activity: readonly ActivityDay[],
  today: string,
  weeks: number = CALENDAR_WEEKS,
): CalendarGrid {
  const todayMs = parseDay(today);
  const thisMonday = todayMs - mondayIndex(todayMs) * DAY_MS;
  const start = thisMonday - (weeks - 1) * WEEK_DAYS * DAY_MS;
  const counts = new Map(activity.map((a) => [a.date, a.tests]));
  const thresholds = quantileThresholds([...counts.values()]);

  return Array.from({ length: weeks }, (_, column) =>
    Array.from({ length: WEEK_DAYS }, (_, row): CalendarCell | null => {
      const ms = start + (column * WEEK_DAYS + row) * DAY_MS;
      if (ms > todayMs) return null;
      const date = formatDay(ms);
      const tests = counts.get(date) ?? 0;
      return { date, tests, level: levelFor(tests, thresholds) };
    }),
  );
}

/** Number of days the grid shows (the non-null cells). */
export function countDays(grid: CalendarGrid): number {
  return grid.reduce((sum, week) => sum + week.filter((c) => c !== null).length, 0);
}

/**
 * Where the month names go: the first column whose Monday falls in a new month. A label is
 * skipped when it would sit within one column of the previous one.
 */
export function monthLabels(grid: CalendarGrid): MonthLabel[] {
  const labels: MonthLabel[] = [];
  let previousMonth = -1;
  grid.forEach((week, column) => {
    const monday = week[0];
    if (!monday) return;
    const month = Number(monday.date.slice(5, 7)) - 1;
    if (month === previousMonth) return;
    previousMonth = month;
    const last = labels[labels.length - 1];
    if (last && column - last.column < 2) {
      labels[labels.length - 1] = { column, month };
    } else {
      labels.push({ column, month });
    }
  });
  return labels;
}
