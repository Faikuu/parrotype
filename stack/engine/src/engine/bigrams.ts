import type { Rng } from '../text/rng';
import { WORDLISTS } from '../text/languages';
import { drawWeighted } from '../text/weak';
import { createInitialState, engineReducer } from './engine';
import { eventAction } from './replay';
import type { EngineState, Keystroke, Language } from './types';

/** Delays longer than this are pauses, not typing, and are left out. */
export const PAUSE_MS = 2000;

const LETTER = /^\p{L}$/u;

/** Summed delay (ms) and the number of times a letter pair was typed. Fractional after mergeBigrams. */
export interface BigramStat { total: number; count: number }
export type BigramStats = Record<string, BigramStat>;

/**
 * Delays between consecutive correct letter keystrokes of one word, keyed by the two expected letters
 * (lower-cased, e.g. "th"). The delay is measured from the previous key to this one. A pair only counts when
 * both keys are correct chars typed back to back (no backspace, space or Enter between them) and the delay is
 * at most PAUSE_MS. Extra chars and non-letters are skipped.
 */
export function computeBigrams(state: EngineState): BigramStats {
  const out: BigramStats = {};
  // Replay the events to know which word each keystroke belongs to.
  let replayed = createInitialState(state.config, state.words, state.code ? { code: state.code } : {});
  let prev: { word: number; keystroke: Keystroke } | null = null;
  for (const e of state.events) {
    const word = replayed.current;
    const before = replayed.keystrokes.length;
    replayed = engineReducer(replayed, eventAction(e));
    const keystroke = replayed.keystrokes[before];
    if (e.k !== 'c' || keystroke === undefined) {
      prev = null;
      continue;
    }
    if (prev !== null && prev.word === word && prev.keystroke.correct && keystroke.correct) {
      const a = prev.keystroke.expected.toLowerCase();
      const b = keystroke.expected.toLowerCase();
      const delay = keystroke.at - prev.keystroke.at;
      if (LETTER.test(a) && LETTER.test(b) && delay <= PAUSE_MS) {
        const key = a + b;
        const stat = out[key] ?? { total: 0, count: 0 };
        stat.total += delay;
        stat.count += 1;
        out[key] = stat;
      }
    }
    prev = { word, keystroke };
  }
  return out;
}

/**
 * Folds `latest` (one test) into `a` (the running totals). `a` is multiplied by `decay` first, so recent tests
 * count more. Neither input is changed. Same convention as mergeKeyStats.
 */
export function mergeBigrams(a: BigramStats, latest: BigramStats, decay = 0.9): BigramStats {
  const out: BigramStats = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(latest)])) {
    const old = a[key];
    const b = latest[key];
    out[key] = {
      total: (old?.total ?? 0) * decay + (b?.total ?? 0),
      count: (old?.count ?? 0) * decay + (b?.count ?? 0),
    };
  }
  return out;
}

export interface SlowPair { pair: string; avgMs: number; count: number }

/**
 * The `n` slowest pairs with at least `minCount` occurrences, slowest first (highest average delay). Ties
 * are ordered alphabetically by pair.
 */
export function slowestBigrams(stats: BigramStats, n = 5, minCount = 3): SlowPair[] {
  return Object.entries(stats)
    .filter(([, s]) => s.count > 0 && s.count >= minCount)
    .map(([pair, s]) => ({ pair, avgMs: s.total / s.count, count: s.count }))
    .sort((x, y) => y.avgMs - x.avgMs || (x.pair < y.pair ? -1 : x.pair > y.pair ? 1 : 0))
    .slice(0, Math.max(0, n));
}

/**
 * `count` words from the language list for practising the `pairs`. A word is weighted by (1 + 3k)^2, where
 * k is the number of distinct target pairs it contains, as in weakKeyWords. With no pairs (or none in any
 * word) every word has weight 1, so these are plain random words.
 */
export function bigramWords(pairs: readonly string[], language: Language, count = 40, rng: Rng = Math.random): string[] {
  const targets = new Set(pairs.map((p) => p.toLowerCase()));
  const list = WORDLISTS[language];
  const weights = list.map((word) => {
    const lower = word.toLowerCase();
    const found = new Set<string>();
    for (let i = 0; i + 1 < lower.length; i++) {
      const pair = lower.slice(i, i + 2);
      if (targets.has(pair)) found.add(pair);
    }
    return (1 + 3 * found.size) ** 2;
  });
  return drawWeighted(list, weights, count, rng);
}
