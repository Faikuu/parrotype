import { z } from 'zod';

export const RACE_OPTIONS = Symbol('RACE_OPTIONS');

export interface RaceOptions {
  /** Epoch ms source. Injected so the room logic can be tested with a fake clock. */
  clock: () => number;
  /** Time between start and the racing state. 3000 in production; tests shorten it. */
  countdownMs: number;
}

const countdownSchema = z.coerce.number().int().min(0).max(10_000).default(3000);

/**
 * Reads RACE_COUNTDOWN_MS (default 3000, max 10000). Read here rather than in config/env.ts so
 * the races module stays self-contained; the e2e test uses it to shorten the countdown.
 */
export function raceCountdownMs(source: NodeJS.ProcessEnv = process.env): number {
  const raw = source.RACE_COUNTDOWN_MS;
  const parsed = countdownSchema.safeParse(raw === undefined || raw === '' ? undefined : raw);
  if (!parsed.success) {
    throw new Error('RACE_COUNTDOWN_MS must be an integer from 0 to 10000');
  }
  return parsed.data;
}
