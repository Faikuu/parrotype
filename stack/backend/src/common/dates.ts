const DAY_MS = 86_400_000;

/**
 * The UTC calendar date `offsetDays` from `now`, as YYYY-MM-DD. UTC days are exactly
 * 86_400_000 ms apart in JS time, so adding whole days to the timestamp is safe.
 */
export function utcDate(offsetDays = 0, now: number = Date.now()): string {
  return new Date(now + offsetDays * DAY_MS).toISOString().slice(0, 10);
}
