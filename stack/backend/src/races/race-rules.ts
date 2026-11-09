import { MAX_WPM } from './races.protocol';

/** The most characters a player may have typed `elapsedMs` after the start (a 350 wpm pace, plus 15 characters of slack). */
export function maxCharsAt(elapsedMs: number): number {
  return Math.floor((MAX_WPM * 5 * Math.max(0, elapsedMs)) / 60_000) + 15;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Words per minute for `chars` characters typed over `durationMs` (5 characters a word). Infinity for a non-positive duration. */
export function wpmFor(chars: number, durationMs: number): number {
  if (durationMs <= 0) return Infinity;
  return round2((chars / 5) / (durationMs / 60_000));
}

/** The live wpm shown for a player: the client's claim, capped by the pace the server can see, and by MAX_WPM. */
export function liveWpm(clientWpm: number, chars: number, elapsedMs: number): number {
  const implied = wpmFor(chars, elapsedMs);
  return round2(Math.min(clientWpm, implied, MAX_WPM));
}

/** Accuracy from the client, clamped to 0-100. It can't be checked, so it is kept. */
export function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n));
}
