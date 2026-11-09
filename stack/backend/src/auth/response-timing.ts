import { randomInt } from 'node:crypto';

/**
 * The forgot-password answer takes at least this long, plus a random jitter, whichever path ran. Without it,
 * an account (which does the emailing work) answers at a different speed from an unknown address.
 */
export const FORGOT_MIN_MS = 400;
export const FORGOT_JITTER_MS = 100;

export interface PaceDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** A whole number of milliseconds from 0 to the jitter bound, inclusive. */
  jitter: () => number;
}

export const realPaceDeps: PaceDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  jitter: () => randomInt(0, FORGOT_JITTER_MS + 1),
};

/**
 * Waits until `minMs` plus a jitter have passed since `startedMs` (a Date.now() reading taken at the start of
 * the request). Never waits when that time has already passed. Returns the time it waited, in milliseconds.
 */
export async function padResponse(startedMs: number, deps: PaceDeps = realPaceDeps, minMs = FORGOT_MIN_MS): Promise<number> {
  const target = minMs + deps.jitter();
  const wait = target - (deps.now() - startedMs);
  if (wait <= 0) return 0;
  await deps.sleep(wait);
  return wait;
}
