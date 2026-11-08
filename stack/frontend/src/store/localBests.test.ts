import {
  averageOf,
  bestKey,
  isPersonalBest,
  RECENT_COUNT,
  sanitizeBests,
  useLocalBests,
} from './localBests';
import { foldKeyStats, sanitizeKeyStats, useKeyStats, weakLetters } from './keyStats';

const cfg = { mode: 'time' as const, language: 'en' as const, punctuation: false, numbers: false };

beforeEach(() => {
  useLocalBests.setState({ bests: {}, recentWpm: [] });
  useKeyStats.setState({ byLanguage: {} });
});

describe('isPersonalBest', () => {
  it('is false when there is no previous best to beat', () => {
    expect(isPersonalBest(90, undefined, undefined)).toBe(false);
  });

  it('is true only when the run beats the local best', () => {
    expect(isPersonalBest(81, 80)).toBe(true);
    expect(isPersonalBest(80, 80)).toBe(false);
    expect(isPersonalBest(79, 80)).toBe(false);
  });

  it('also compares with the server best when one is given', () => {
    // Local best is lower, but the account has a higher best for this config.
    expect(isPersonalBest(85, 70, 90)).toBe(false);
    expect(isPersonalBest(95, 70, 90)).toBe(true);
    // A server best alone counts as a previous best.
    expect(isPersonalBest(95, undefined, 90)).toBe(true);
    expect(isPersonalBest(85, undefined, 90)).toBe(false);
  });
});

describe('bestKey', () => {
  it('separates tests by mode, mode2, language and the punctuation and numbers flags', () => {
    const a = bestKey(cfg, '30');
    expect(a).not.toBe(bestKey(cfg, '60'));
    expect(a).not.toBe(bestKey({ ...cfg, language: 'pl' }, '30'));
    expect(a).not.toBe(bestKey({ ...cfg, punctuation: true }, '30'));
    expect(a).not.toBe(bestKey({ ...cfg, numbers: true }, '30'));
  });

  it('keys a daily test by its date', () => {
    const daily = { ...cfg, mode: 'daily' as const };
    expect(bestKey(daily, '2026-11-07')).not.toBe(bestKey(daily, '2026-11-08'));
  });
});

describe('localBests store', () => {
  it('keeps the highest wpm per key and ignores a lower run', () => {
    const key = bestKey(cfg, '30');
    useLocalBests.getState().record(key, { wpm: 70, accuracy: 95 }, 1);
    useLocalBests.getState().record(key, { wpm: 60, accuracy: 99 }, 2);
    expect(useLocalBests.getState().bests[key]).toEqual({ wpm: 70, accuracy: 95, at: 1 });
    useLocalBests.getState().record(key, { wpm: 75, accuracy: 96 }, 3);
    expect(useLocalBests.getState().bests[key]).toEqual({ wpm: 75, accuracy: 96, at: 3 });
  });

  it('keeps only the last 10 wpm values and averages them', () => {
    for (let i = 1; i <= RECENT_COUNT + 5; i++) useLocalBests.getState().record('k', { wpm: i * 10, accuracy: 90 });
    const { recentWpm } = useLocalBests.getState();
    expect(recentWpm).toHaveLength(RECENT_COUNT);
    expect(recentWpm[0]).toBe(60);
    expect(recentWpm[RECENT_COUNT - 1]).toBe(150);
    expect(averageOf(recentWpm)).toBe(105);
  });

  it('has no average before the first test', () => {
    expect(averageOf([])).toBeNull();
  });

  it('sanitizes stored values', () => {
    const clean = sanitizeBests({
      bests: { a: { wpm: 50, accuracy: 90, at: 1 }, bad: { wpm: 'x' }, nothing: null },
      recentWpm: [10, 'x', 20, Number.NaN],
    });
    expect(Object.keys(clean.bests)).toEqual(['a']);
    expect(clean.recentWpm).toEqual([10, 20]);
    expect(sanitizeBests('nope')).toEqual({ bests: {}, recentWpm: [] });
  });
});

describe('keyStats store', () => {
  it('folds accented Spanish vowels into their base letters', () => {
    const folded = foldKeyStats(
      { á: { hits: 1, misses: 2 }, a: { hits: 3, misses: 0 }, ñ: { hits: 1, misses: 1 } },
      'es',
    );
    expect(folded.a).toEqual({ hits: 4, misses: 2 });
    expect(folded.á).toBeUndefined();
    expect(folded.ñ).toEqual({ hits: 1, misses: 1 });
  });

  it('does not fold for other languages', () => {
    const stats = { ä: { hits: 1, misses: 0 } };
    expect(foldKeyStats(stats, 'de')).toEqual(stats);
  });

  it('merges a finished test into the totals for its language only', () => {
    useKeyStats.getState().record({ q: { hits: 0, misses: 4 } }, 'en');
    useKeyStats.getState().record({ q: { hits: 2, misses: 0 } }, 'en');
    expect(useKeyStats.getState().byLanguage.en?.q).toEqual({ hits: 2, misses: 3.6 });
    expect(useKeyStats.getState().byLanguage.pl).toBeUndefined();
  });

  it('leaves the totals alone when a test has no letter data', () => {
    useKeyStats.getState().record({ q: { hits: 0, misses: 4 } }, 'en');
    const before = useKeyStats.getState().byLanguage;
    useKeyStats.getState().record({}, 'en');
    expect(useKeyStats.getState().byLanguage).toBe(before);
  });

  it('names weak letters only when they have at least one miss', () => {
    // Enough samples for z (no misses) and q (misses), but z has none.
    const stats = { q: { hits: 6, misses: 4 }, z: { hits: 20, misses: 0 } };
    expect(weakLetters(stats, 'en')).toEqual(['q']);
    expect(weakLetters(undefined, 'en')).toEqual([]);
  });

  it('sanitizes stored key stats', () => {
    const clean = sanitizeKeyStats({
      byLanguage: { en: { q: { hits: 1, misses: 2 }, bad: { hits: 'x', misses: 1 } }, xx: { a: { hits: 1, misses: 1 } } },
    });
    expect(clean.byLanguage).toEqual({ en: { q: { hits: 1, misses: 2 } } });
  });
});

describe('storage failures', () => {
  it('a throwing localStorage does not break recording a best', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      expect(() => useLocalBests.getState().record('k', { wpm: 50, accuracy: 90 })).not.toThrow();
      expect(useLocalBests.getState().bests.k?.wpm).toBe(50);
    } finally {
      spy.mockRestore();
    }
  });
});
