import { describe, it, expect } from 'vitest';
import { computeKeyStats, mergeKeyStats, weakestKeys } from './keystats';
import type { KeyStatsMap, Keystroke } from './types';

function ks(expected: string, correct: boolean): Keystroke {
  return { at: 0, expected, correct };
}

describe('computeKeyStats', () => {
  it('counts hits and misses per lower-cased letter from known keystrokes', () => {
    const stats = computeKeyStats({
      keystrokes: [
        ks('a', true),
        ks('a', false),
        ks('B', true),
        ks('b', true),
        ks('c', false),
        ks('c', false),
      ],
    });
    expect(stats).toEqual({
      a: { hits: 1, misses: 1 },
      b: { hits: 2, misses: 0 },
      c: { hits: 0, misses: 2 },
    });
  });

  it('skips spaces, punctuation, digits and extra chars', () => {
    const stats = computeKeyStats({
      keystrokes: [ks(' ', false), ks('', false), ks('.', true), ks('1', false), ks(',', false), ks('x', true)],
    });
    expect(Object.keys(stats)).toEqual(['x']);
    expect(stats.x).toEqual({ hits: 1, misses: 0 });
  });

  it('counts non-ASCII letters', () => {
    const stats = computeKeyStats({ keystrokes: [ks('ä', false), ks('Ä', true), ks('ñ', true), ks('ß', false)] });
    expect(stats.ä).toEqual({ hits: 1, misses: 1 });
    expect(stats.ñ).toEqual({ hits: 1, misses: 0 });
    expect(stats.ß).toEqual({ hits: 0, misses: 1 });
  });

  it('is empty for no keystrokes', () => {
    expect(computeKeyStats({ keystrokes: [] })).toEqual({});
  });
});

describe('mergeKeyStats', () => {
  it('decays the old values by the factor, then adds the latest test', () => {
    const old: KeyStatsMap = { e: { hits: 10, misses: 5 } };
    const latest: KeyStatsMap = { e: { hits: 2, misses: 1 }, q: { hits: 0, misses: 3 } };
    const merged = mergeKeyStats(old, latest, 0.5);
    expect(merged.e).toEqual({ hits: 7, misses: 3.5 });
    expect(merged.q).toEqual({ hits: 0, misses: 3 });
  });

  it('uses 0.9 by default', () => {
    const merged = mergeKeyStats({ e: { hits: 10, misses: 10 } }, {});
    expect(merged.e?.hits).toBeCloseTo(9);
    expect(merged.e?.misses).toBeCloseTo(9);
  });

  it('recent tests count more: after many clean tests an old miss fades', () => {
    let stats: KeyStatsMap = { k: { hits: 0, misses: 10 } };
    for (let i = 0; i < 100; i++) stats = mergeKeyStats(stats, { k: { hits: 5, misses: 0 } });
    expect(stats.k?.misses).toBeLessThan(0.05);
    expect(stats.k?.hits).toBeGreaterThan(40);
  });

  it('does not change its inputs', () => {
    const old: KeyStatsMap = { a: { hits: 1, misses: 1 } };
    const latest: KeyStatsMap = { a: { hits: 1, misses: 0 } };
    mergeKeyStats(old, latest);
    expect(old).toEqual({ a: { hits: 1, misses: 1 } });
    expect(latest).toEqual({ a: { hits: 1, misses: 0 } });
  });
});

describe('weakestKeys', () => {
  const stats: KeyStatsMap = {
    a: { hits: 5, misses: 5 }, // rate .5, misses 5
    b: { hits: 0, misses: 8 }, // rate 1
    c: { hits: 9, misses: 1 }, // rate .1
    d: { hits: 1, misses: 1 }, // only 2 samples: excluded by minSamples
    e: { hits: 8, misses: 2 }, // rate .2
    f: { hits: 6, misses: 2 }, // rate .25
    x: { hits: 4, misses: 4 }, // rate .5, misses 4 (ties a on rate, loses on misses)
  };
  const alphabet = 'abcdefx';

  it('ranks by miss rate, highest first, and drops letters with too few samples', () => {
    expect(weakestKeys(stats, alphabet)).toEqual(['b', 'a', 'x', 'f', 'e']);
  });

  it('respects n', () => {
    expect(weakestKeys(stats, alphabet, 2)).toEqual(['b', 'a']);
    expect(weakestKeys(stats, alphabet, 0)).toEqual([]);
  });

  it('breaks ties by misses, then alphabetically', () => {
    const tied: KeyStatsMap = {
      m: { hits: 4, misses: 4 },
      k: { hits: 4, misses: 4 },
      z: { hits: 1, misses: 1 },
    };
    expect(weakestKeys(tied, 'zkm', 3, 8)).toEqual(['k', 'm']);
    expect(weakestKeys(tied, 'zkm', 3, 2)).toEqual(['k', 'm', 'z']);
  });

  it('minSamples defaults to 8 and is a hard cut', () => {
    const seven: KeyStatsMap = { q: { hits: 0, misses: 7 } };
    expect(weakestKeys(seven, 'q')).toEqual([]);
    expect(weakestKeys({ q: { hits: 0, misses: 8 } }, 'q')).toEqual(['q']);
  });

  it('only ranks letters of the alphabet', () => {
    expect(weakestKeys({ '!': { hits: 0, misses: 20 }, a: { hits: 0, misses: 9 } }, 'ab')).toEqual(['a']);
  });

  it('works with fractional (decayed) counts', () => {
    expect(weakestKeys({ s: { hits: 7.5, misses: 0.7 }, t: { hits: 2, misses: 0.1 } }, 'st', 5, 8)).toEqual(['s']);
  });
});
