import { describe, it, expect } from 'vitest';
import { dailySeed, dailyWords, DAILY_WORD_COUNT, utcDateString } from './daily';
import { isPangram } from './pangram';
import { LANGUAGES, WORDLISTS } from './languages';

/** Independent BigInt FNV-1a 32-bit, to check dailySeed against the spec. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x01000193n) & 0xffffffffn;
  }
  return Number(hash);
}

describe('utcDateString', () => {
  it('gives the UTC calendar date', () => {
    expect(utcDateString(Date.UTC(2026, 10, 8, 0, 0, 0))).toBe('2026-11-08');
    expect(utcDateString(Date.UTC(2026, 10, 8, 23, 59, 59))).toBe('2026-11-08');
    expect(utcDateString(Date.UTC(2026, 10, 9, 0, 0, 0))).toBe('2026-11-09');
  });

  it('pads month and day', () => {
    expect(utcDateString(Date.UTC(2027, 0, 5, 12))).toBe('2027-01-05');
  });
});

describe('dailySeed', () => {
  it('is FNV-1a of parrotype-daily:<date>:<language>', () => {
    expect(dailySeed('2026-11-08', 'en')).toBe(fnv1a('parrotype-daily:2026-11-08:en'));
    expect(dailySeed('2026-11-08', 'de')).toBe(fnv1a('parrotype-daily:2026-11-08:de'));
  });

  it('differs by date and by language', () => {
    expect(dailySeed('2026-11-08', 'en')).not.toBe(dailySeed('2026-11-09', 'en'));
    expect(dailySeed('2026-11-08', 'en')).not.toBe(dailySeed('2026-11-08', 'es'));
  });

  it('is a 32-bit unsigned integer', () => {
    const seed = dailySeed('2026-11-08', 'pl');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});

describe('dailyWords', () => {
  for (const language of LANGUAGES) {
    it(`${language}: same date and language give identical words`, () => {
      expect(dailyWords('2026-11-08', language)).toEqual(dailyWords('2026-11-08', language));
    });

    it(`${language}: a different date gives different words`, () => {
      expect(dailyWords('2026-11-08', language)).not.toEqual(dailyWords('2026-11-09', language));
    });

    it(`${language}: starts with one pangram, then ${DAILY_WORD_COUNT} punctuated words`, () => {
      const words = dailyWords('2026-11-08', language);
      const pangramLength = words.length - DAILY_WORD_COUNT;
      expect(pangramLength).toBeGreaterThan(5);
      expect(isPangram(words.slice(0, pangramLength).join(' '), language)).toBe(true);
      expect(words[pangramLength - 1]).toMatch(/\.$/);
      const rest = words.slice(pangramLength);
      expect(rest.every((w) => w.length > 0 && !w.includes(' '))).toBe(true);
      expect(rest.at(-1)).toMatch(/[.?!]$/);
    });
  }

  it('the daily words are drawn from the language word list', () => {
    const list = new Set(WORDLISTS.en.map((w) => w.toLowerCase()));
    const words = dailyWords('2026-11-08', 'en');
    const bare = words.map((w) => w.replace(/[.,?!:;"]/g, '').replace(/-.*$/, '').toLowerCase());
    expect(bare.every((w) => list.has(w))).toBe(true);
  });

  it('does not depend on the language of another date or on call order', () => {
    const first = dailyWords('2026-01-01', 'es');
    dailyWords('2026-06-01', 'de');
    expect(dailyWords('2026-01-01', 'es')).toEqual(first);
  });
});
