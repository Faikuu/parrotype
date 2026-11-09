import { z } from 'zod';

export const RACE_OPTIONS = Symbol('RACE_OPTIONS');
export const RACE_SOCKET_LIMITS = Symbol('RACE_SOCKET_LIMITS');

export interface RaceOptions {
  /** Epoch ms source. Injected so the room logic can be tested with a fake clock. */
  clock: () => number;
  /** Time between start and the racing state. 3000 in production; tests shorten it. */
  countdownMs: number;
}

export interface RaceSocketLimits {
  /** Sockets allowed per client IP. */
  maxSocketsPerIp: number;
  /** Time a new socket has to send a valid join. */
  joinTimeoutMs: number;
  /** Ping interval. A socket that has not answered the last ping is terminated at the next one. */
  heartbeatMs: number;
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

function readInt(source: NodeJS.ProcessEnv, name: string, min: number, max: number, fallback: number): number {
  const raw = source[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return n;
}

/**
 * Socket limits. RACE_MAX_SOCKETS_PER_IP (default 10), RACE_JOIN_TIMEOUT_MS (default 10000) and
 * RACE_HEARTBEAT_MS (default 25000). The e2e test and the manual check lower them.
 */
export function raceSocketLimits(source: NodeJS.ProcessEnv = process.env): RaceSocketLimits {
  return {
    maxSocketsPerIp: readInt(source, 'RACE_MAX_SOCKETS_PER_IP', 1, 1000, 10),
    joinTimeoutMs: readInt(source, 'RACE_JOIN_TIMEOUT_MS', 100, 120_000, 10_000),
    heartbeatMs: readInt(source, 'RACE_HEARTBEAT_MS', 100, 120_000, 25_000),
  };
}
