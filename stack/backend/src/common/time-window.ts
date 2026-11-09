import { z } from 'zod';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** An ISO 8601 date-time with an offset or Z, read into a Date. */
export const isoDateSchema = z
  .string()
  .datetime({ offset: true, message: 'must be an ISO 8601 date-time' })
  .transform((value) => new Date(value));

/**
 * Why a [startsAt, endsAt) window is not allowed, or null. endsAt must be after startsAt, and the window may
 * be at most maxMs long. No end (null) is always allowed.
 */
export function windowProblem(startsAt: Date, endsAt: Date | null | undefined, maxMs?: number): string | null {
  if (endsAt === null || endsAt === undefined) return null;
  if (endsAt.getTime() <= startsAt.getTime()) return 'endsAt must be after startsAt';
  if (maxMs !== undefined && endsAt.getTime() - startsAt.getTime() > maxMs) {
    return `the window may last at most ${Math.round(maxMs / DAY_MS)} days`;
  }
  return null;
}
