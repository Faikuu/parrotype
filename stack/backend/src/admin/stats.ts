import { utcDate } from '../common/dates';

/** The days charted on the dashboard: today and the 29 before it, in UTC. */
export const STATS_DAYS = 30;
const DAY_MS = 86_400_000;

export interface DayCount {
  date: string;
  count: number;
}

/** The UTC dates of the window, oldest first, ending on the UTC day of `now`. */
export function dayWindow(now: number, days: number = STATS_DAYS): string[] {
  return Array.from({ length: days }, (_, i) => utcDate(i - (days - 1), now));
}

/** 00:00 UTC of the first day of the window: the lower bound of the database read. */
export function windowStart(now: number, days: number = STATS_DAYS): Date {
  return new Date(`${dayWindow(now, days)[0]}T00:00:00.000Z`);
}

/** 00:00 UTC of the day of `now`. */
export function startOfUtcDay(now: number): Date {
  return new Date(`${utcDate(0, now)}T00:00:00.000Z`);
}

/** `now` minus whole days, in ms. */
export function daysAgo(now: number, days: number): Date {
  return new Date(now - days * DAY_MS);
}

/**
 * One count per UTC day of the window, zero where nothing happened. Timestamps outside the window are
 * ignored, so the caller may pass a read that is a little wider than the window.
 */
export function countByDay(times: readonly Date[], now: number, days: number = STATS_DAYS): DayCount[] {
  const window = dayWindow(now, days);
  const counts = new Map<string, number>(window.map((date) => [date, 0]));
  for (const t of times) {
    const key = t.toISOString().slice(0, 10);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return window.map((date) => ({ date, count: counts.get(date) ?? 0 }));
}
