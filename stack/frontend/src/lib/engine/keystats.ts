import type { EngineState, KeyStatsMap } from './types';

export type { KeyStat, KeyStatsMap } from './types';

const LETTER = /^\p{L}$/u;

/**
 * Hits and misses per letter for one test. Keyed by the lower-cased target char; only letters count
 * (spaces, punctuation and extra chars are skipped). Works for any language's letters (ä, ñ, ą...).
 */
export function computeKeyStats(state: Pick<EngineState, 'keystrokes'>): KeyStatsMap {
  const out: KeyStatsMap = {};
  for (const k of state.keystrokes) {
    if (k.expected === '') continue;
    const key = k.expected.toLowerCase();
    if (!LETTER.test(key)) continue;
    const stat = out[key] ?? { hits: 0, misses: 0 };
    if (k.correct) stat.hits++;
    else stat.misses++;
    out[key] = stat;
  }
  return out;
}

/**
 * Folds `latest` (one test) into `old` (the running totals). Every old value is multiplied by `decay`
 * first, so recent tests count more. Neither input is changed.
 */
export function mergeKeyStats(old: KeyStatsMap, latest: KeyStatsMap, decay = 0.9): KeyStatsMap {
  const out: KeyStatsMap = {};
  const keys = new Set([...Object.keys(old), ...Object.keys(latest)]);
  for (const key of keys) {
    const a = old[key];
    const b = latest[key];
    out[key] = {
      hits: (a?.hits ?? 0) * decay + (b?.hits ?? 0),
      misses: (a?.misses ?? 0) * decay + (b?.misses ?? 0),
    };
  }
  return out;
}

/**
 * The `n` letters of `alphabet` with the highest miss rate (misses / (hits + misses)), ties broken by
 * the number of misses, then alphabetically. Letters with fewer than `minSamples` keystrokes are left out.
 */
export function weakestKeys(stats: KeyStatsMap, alphabet: string, n = 5, minSamples = 8): string[] {
  const letters = [...new Set([...alphabet])];
  const ranked = letters
    .map((letter) => {
      const stat = stats[letter];
      const hits = stat?.hits ?? 0;
      const misses = stat?.misses ?? 0;
      const samples = hits + misses;
      return { letter, samples, misses, rate: samples > 0 ? misses / samples : 0 };
    })
    .filter((r) => r.samples >= minSamples);

  ranked.sort((a, b) => b.rate - a.rate || b.misses - a.misses || (a.letter < b.letter ? -1 : a.letter > b.letter ? 1 : 0));
  return ranked.slice(0, Math.max(0, n)).map((r) => r.letter);
}
