import { describe, it, expect } from 'vitest';
import { createInitialState, engineReducer } from './engine';
import {
  PAUSE_MS,
  bigramWords,
  computeBigrams,
  mergeBigrams,
  slowestBigrams,
  type BigramStats,
} from './bigrams';
import { createRng } from '../text/rng';
import { en } from '../text/wordlists/en';
import type { EngineAction, EngineState, TestConfig } from './types';

const base: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false, codeLanguage: 'js',
};

/** Applies (key, time) pairs: '_' is space, '<' is backspace, '\n' is Enter, anything else a char. */
function run(words: string[], script: [string, number][], config: Partial<TestConfig> = {}): EngineState {
  let s = createInitialState({ ...base, ...config }, words);
  for (const [key, at] of script) {
    let action: EngineAction;
    if (key === '_') action = { type: 'space', at };
    else if (key === '<') action = { type: 'backspace', at };
    else if (key === '\n') action = { type: 'newline', at };
    else action = { type: 'char', char: key, at };
    s = engineReducer(s, action);
  }
  return s;
}

describe('computeBigrams', () => {
  it('measures the delay from one correct key to the next, keyed by the two letters', () => {
    // t at 0, h at 100 (th: 100), e at 300 (he: 200)
    const stats = computeBigrams(run(['the'], [['t', 0], ['h', 100], ['e', 300]]));
    expect(stats).toEqual({ th: { total: 100, count: 1 }, he: { total: 200, count: 1 } });
  });

  it('accumulates the same pair within a test', () => {
    // "aaa": a 0, a 150 (aa: 150), a 400 (aa: 250); after a space the next word's a 500 pairs with nothing
    // (a space came before it), then b 700 (ab: 200)
    const stats = computeBigrams(run(['aaa', 'ab'], [['a', 0], ['a', 150], ['a', 400], ['_', 450], ['a', 500], ['b', 700]]));
    expect(stats.aa).toEqual({ total: 150 + 250, count: 2 });
    expect(stats.ab).toEqual({ total: 200, count: 1 });
  });

  it('does not pair across a space (the space delay is not a letter delay)', () => {
    // a 0, b 100, space 200, c 300, d 400: ab and cd, but no bc
    const stats = computeBigrams(run(['ab', 'cd'], [['a', 0], ['b', 100], ['_', 200], ['c', 300], ['d', 400]]));
    expect(stats).toEqual({ ab: { total: 100, count: 1 }, cd: { total: 100, count: 1 } });
  });

  it('does not pair across a line break in code mode', () => {
    const state = createInitialState(
      { ...base, mode: 'code', codeLanguage: 'js' },
      ['ab', 'cd'],
      { code: { breaks: [true, false], indent: [0, 0] } },
    );
    // a 0, b 100, Enter 200 (ends the line), c 300, d 400: ab and cd, but no bc
    let s = engineReducer(state, { type: 'char', char: 'a', at: 0 });
    s = engineReducer(s, { type: 'char', char: 'b', at: 100 });
    s = engineReducer(s, { type: 'newline', at: 200 });
    s = engineReducer(s, { type: 'char', char: 'c', at: 300 });
    s = engineReducer(s, { type: 'char', char: 'd', at: 400 });
    expect(computeBigrams(s)).toEqual({ ab: { total: 100, count: 1 }, cd: { total: 100, count: 1 } });
  });

  it('skips a delay over the pause limit, and keeps one at the limit', () => {
    expect(PAUSE_MS).toBe(2000);
    expect(computeBigrams(run(['ab'], [['a', 0], ['b', 2500]]))).toEqual({});
    expect(computeBigrams(run(['ab'], [['a', 0], ['b', 2000]]))).toEqual({ ab: { total: 2000, count: 1 } });
  });

  it('skips a pair with a backspace between the two keys', () => {
    // a 0, backspace 100, a 200 (no pair), a 300 (aa: 100)
    const stats = computeBigrams(run(['aa'], [['a', 0], ['<', 100], ['a', 200], ['a', 300]]));
    expect(stats).toEqual({ aa: { total: 100, count: 1 } });
  });

  it('skips keys that were typed wrong', () => {
    // x is wrong for the first letter; b after it is correct but its pair is not counted
    const stats = computeBigrams(run(['ab'], [['x', 0], ['b', 100]]));
    expect(stats).toEqual({});
  });

  it('skips extra chars and non-letters', () => {
    expect(computeBigrams(run(['a1'], [['a', 0], ['1', 100]]))).toEqual({});
    // The extra 'z' typed past the end of "ab" has no target letter, so it pairs with nothing.
    expect(computeBigrams(run(['ab', 'cd'], [['a', 0], ['b', 100], ['z', 200]]))).toEqual({ ab: { total: 100, count: 1 } });
  });

  it('lower-cases the key (a capital target counts as its letter)', () => {
    const stats = computeBigrams(run(['Th'], [['T', 0], ['h', 120]]));
    expect(stats).toEqual({ th: { total: 120, count: 1 } });
  });

  it('is empty for a test with fewer than two keys', () => {
    expect(computeBigrams(run(['a'], []))).toEqual({});
    expect(computeBigrams(run(['a'], [['a', 0]]))).toEqual({});
  });
});

describe('mergeBigrams', () => {
  it('decays the old totals and adds the latest test', () => {
    const old: BigramStats = { th: { total: 100, count: 1 }, he: { total: 50, count: 2 } };
    const latest: BigramStats = { th: { total: 50, count: 1 }, in: { total: 80, count: 1 } };
    const merged = mergeBigrams(old, latest, 0.5);
    expect(merged.th).toEqual({ total: 100 * 0.5 + 50, count: 1 * 0.5 + 1 });
    expect(merged.he).toEqual({ total: 25, count: 1 });
    expect(merged.in).toEqual({ total: 80, count: 1 });
  });

  it('uses 0.9 by default and changes neither input', () => {
    const old: BigramStats = { th: { total: 100, count: 1 } };
    const latest: BigramStats = { th: { total: 10, count: 1 } };
    const merged = mergeBigrams(old, latest);
    expect(merged.th?.total).toBeCloseTo(100 * 0.9 + 10);
    expect(old).toEqual({ th: { total: 100, count: 1 } });
    expect(latest).toEqual({ th: { total: 10, count: 1 } });
  });
});

describe('slowestBigrams', () => {
  const stats: BigramStats = {
    th: { total: 900, count: 3 }, // avg 300
    he: { total: 600, count: 3 }, // avg 200
    in: { total: 1000, count: 2 }, // avg 500, but only 2 samples
    er: { total: 400, count: 4 }, // avg 100
    qz: { total: 1200, count: 3 }, // avg 400
    ab: { total: 300, count: 3 }, // avg 100 (ties with er)
  };

  it('orders the pairs slowest first, filtered by minCount', () => {
    expect(slowestBigrams(stats).map((p) => p.pair)).toEqual(['qz', 'th', 'he', 'ab', 'er']);
  });

  it('returns the average delay and the count', () => {
    const [first] = slowestBigrams(stats);
    expect(first).toEqual({ pair: 'qz', avgMs: 400, count: 3 });
  });

  it('takes n pairs and respects minCount', () => {
    expect(slowestBigrams(stats, 2).map((p) => p.pair)).toEqual(['qz', 'th']);
    expect(slowestBigrams(stats, 10, 4).map((p) => p.pair)).toEqual(['er']);
    expect(slowestBigrams(stats, 0)).toEqual([]);
  });

  it('defaults to 5 pairs and minCount 3', () => {
    expect(slowestBigrams(stats)).toHaveLength(5);
    expect(slowestBigrams(stats).some((p) => p.pair === 'in')).toBe(false);
  });
});

describe('bigramWords', () => {
  it('returns the requested number of words from the language list', () => {
    const words = bigramWords(['th'], 'en', 40, createRng(1));
    expect(words).toHaveLength(40);
    expect(words.every((w) => en.includes(w))).toBe(true);
  });

  it('draws words with the target pairs more often than the plain list', () => {
    const containing = en.filter((w) => w.includes('th')).length / en.length;
    const words = bigramWords(['th'], 'en', 2000, createRng(2));
    const ratio = words.filter((w) => w.includes('th')).length / words.length;
    expect(ratio).toBeGreaterThan(containing * 1.5);
  });

  it('never repeats the same word twice in a row', () => {
    const words = bigramWords(['th', 'he'], 'en', 500, createRng(3));
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1]);
  });

  it('falls back to plain random words with no pairs or none present', () => {
    const none = bigramWords([], 'en', 300, createRng(4));
    expect(none).toHaveLength(300);
    expect(none.every((w) => en.includes(w))).toBe(true);
    // A pair no word contains behaves like no pairs: every word has the same weight.
    const absent = bigramWords(['qx'], 'en', 300, createRng(4));
    expect(absent).toEqual(none);
  });
});
