import {
  averageOf,
  bestKey,
  DAILY_KEEP_DATES,
  isPersonalBest,
  MAX_BEST_KEYS,
  pruneBests,
  RECENT_COUNT,
  sanitizeBests,
  serverBestComparable,
  useLocalBests,
  type LocalBestMap,
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

  it('ignores the punctuation and numbers flags for daily (the daily text is always punctuated, no numbers)', () => {
    const daily = { ...cfg, mode: 'daily' as const };
    const key = bestKey(daily, '2026-11-08');
    expect(bestKey({ ...daily, punctuation: false, numbers: true }, '2026-11-08')).toBe(key);
    expect(bestKey({ ...daily, punctuation: true, numbers: false }, '2026-11-08')).toBe(key);
    expect(key).toBe('daily|2026-11-08|en|1|0');
  });
});

describe('serverBestComparable', () => {
  it('compares the server best for modes whose text cannot change with the flags', () => {
    for (const mode of ['quote', 'zen', 'custom', 'weak', 'daily'] as const) {
      expect(serverBestComparable({ mode, punctuation: true, numbers: true })).toBe(true);
    }
  });

  it('compares time, words and pangram only when both flags are off', () => {
    for (const mode of ['time', 'words', 'pangram'] as const) {
      expect(serverBestComparable({ mode, punctuation: false, numbers: false })).toBe(true);
      expect(serverBestComparable({ mode, punctuation: true, numbers: false })).toBe(false);
      expect(serverBestComparable({ mode, punctuation: false, numbers: true })).toBe(false);
    }
  });
});

function dailyKey(date: string, language = 'en', flags = '1|0'): string {
  return `daily|${date}|${language}|${flags}`;
}

describe('pruneBests', () => {
  it('keeps only the latest 7 dates per language and flags', () => {
    const bests: LocalBestMap = {};
    for (let day = 1; day <= 9; day++) {
      const date = `2026-11-${String(day).padStart(2, '0')}`;
      bests[dailyKey(date)] = { wpm: 50, accuracy: 90, at: day };
      bests[dailyKey(date, 'pl')] = { wpm: 40, accuracy: 90, at: day };
    }
    const kept = Object.keys(pruneBests(bests));
    expect(DAILY_KEEP_DATES).toBe(7);
    expect(kept.filter((k) => k.includes('|en|'))).toHaveLength(7);
    expect(kept.filter((k) => k.includes('|pl|'))).toHaveLength(7);
    expect(kept).toContain(dailyKey('2026-11-03'));
    expect(kept).not.toContain(dailyKey('2026-11-02'));
  });

  it('leaves non-daily keys alone and returns the same object when nothing is dropped', () => {
    const bests: LocalBestMap = { 'time|30|en|0|0': { wpm: 60, accuracy: 95, at: 1 } };
    expect(pruneBests(bests)).toBe(bests);
  });

  it('caps the total at MAX_BEST_KEYS, dropping the oldest by `at`', () => {
    const bests: LocalBestMap = {};
    for (let i = 0; i < MAX_BEST_KEYS + 5; i++) bests[`custom|${i}|en|0|0`] = { wpm: 50, accuracy: 90, at: i };
    const pruned = pruneBests(bests);
    expect(Object.keys(pruned)).toHaveLength(MAX_BEST_KEYS);
    expect(pruned['custom|0|en|0|0']).toBeUndefined();
    expect(pruned[`custom|${MAX_BEST_KEYS + 4}|en|0|0`]).toBeDefined();
  });

  it('is applied when recording a best', () => {
    for (let day = 1; day <= 9; day++) {
      const date = `2026-11-${String(day).padStart(2, '0')}`;
      useLocalBests.getState().record(dailyKey(date), { wpm: 50, accuracy: 90 }, day);
    }
    expect(Object.keys(useLocalBests.getState().bests)).toHaveLength(7);
  });

  it('is applied when sanitizing stored bests on load', () => {
    const bests: Record<string, { wpm: number; accuracy: number; at: number }> = {};
    for (let day = 1; day <= 9; day++) {
      bests[dailyKey(`2026-11-${String(day).padStart(2, '0')}`)] = { wpm: 50, accuracy: 90, at: day };
    }
    expect(Object.keys(sanitizeBests({ bests }).bests)).toHaveLength(7);
  });
});

describe('clear', () => {
  it('forgets the bests and the recent list, and removes the stored entry', () => {
    useLocalBests.getState().record('k', { wpm: 50, accuracy: 90 });
    expect(localStorage.getItem('parrotype:bests')).not.toBeNull();
    useLocalBests.getState().clear();
    expect(useLocalBests.getState().bests).toEqual({});
    expect(useLocalBests.getState().recentWpm).toEqual([]);
    expect(localStorage.getItem('parrotype:bests')).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    useLocalBests.getState().record('k', { wpm: 50, accuracy: 90 });
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(() => useLocalBests.getState().clear()).not.toThrow();
      expect(useLocalBests.getState().bests).toEqual({});
    } finally {
      spy.mockRestore();
    }
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

  it('clear forgets the totals and removes the stored entry', () => {
    useKeyStats.getState().record({ q: { hits: 1, misses: 1 } }, 'en');
    expect(localStorage.getItem('parrotype:keystats')).not.toBeNull();
    useKeyStats.getState().clear();
    expect(useKeyStats.getState().byLanguage).toEqual({});
    expect(localStorage.getItem('parrotype:keystats')).toBeNull();
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
