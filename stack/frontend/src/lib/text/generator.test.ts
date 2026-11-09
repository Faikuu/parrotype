import { describe, it, expect } from 'vitest';
import { generateWords, quoteToWords, wordsForConfig, DEFAULT_CUSTOM_TEXT, MAX_CUSTOM_WORDS } from './generator';
import { en } from './wordlists/en';
import { es } from './wordlists/es';
import { createRng } from './rng';
import { isPangram } from './pangram';
import type { TestConfig } from '../engine/types';

const base: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false,
};

describe('generateWords', () => {
  it('returns exactly the requested count', () => {
    expect(generateWords(base, 0)).toEqual([]);
    expect(generateWords(base, 37, createRng(1))).toHaveLength(37);
    expect(generateWords({ ...base, punctuation: true, numbers: true }, 101, createRng(2))).toHaveLength(101);
  });

  it('draws words from the language word list', async () => {
    const { en } = await import('./wordlists/en');
    const words = generateWords(base, 300, createRng(3));
    expect(words.every((w) => en.includes(w))).toBe(true);
  });

  it('never repeats the same word twice in a row (1000 words, both languages)', () => {
    for (const language of ['en', 'pl'] as const) {
      for (const extra of [false, true]) {
        const words = generateWords({ ...base, language, numbers: extra, punctuation: extra }, 1000, createRng(4));
        const bare = words.map((w) => w.replace(/^"|"$/g, '').toLowerCase().replace(/[.,?!:;]$/, ''));
        for (let i = 1; i < bare.length; i++) {
          expect(bare[i], `repeat at ${i} (${language})`).not.toBe(bare[i - 1]);
        }
      }
    }
  });

  it('numbers: about 10% of words are 1-4 digit numbers', () => {
    const words = generateWords({ ...base, numbers: true }, 10000, createRng(5));
    const numbers = words.filter((w) => /^\d{1,4}$/.test(w));
    const ratio = numbers.length / words.length;
    expect(ratio).toBeGreaterThan(0.08);
    expect(ratio).toBeLessThan(0.12);
  });

  it('no numbers unless the config asks for them', () => {
    const words = generateWords(base, 2000, createRng(6));
    expect(words.some((w) => /\d/.test(w))).toBe(false);
  });

  it('punctuation: sentences are capitalised and end with . ? or !', () => {
    const words = generateWords({ ...base, punctuation: true }, 500, createRng(7));
    expect(words.at(-1)).toMatch(/[.?!]$/);
    const terminals = words.filter((w) => /[.?!]$/.test(w));
    expect(terminals.length).toBeGreaterThan(20);
    // Every token that starts a sentence is capitalised: the first token and any after a terminal.
    const starts = [words[0], ...words.slice(1).filter((_, i) => /[.?!]$/.test(words[i] ?? ''))];
    for (const token of starts) {
      expect(token?.replace(/^"/, '').charAt(0)).toBe(token?.replace(/^"/, '').charAt(0).toUpperCase());
    }
    expect(words.some((w) => w.endsWith(','))).toBe(true);
    expect(words.some((w) => w.includes('-'))).toBe(true);
    expect(words.some((w) => w.startsWith('"'))).toBe(true);
    expect(words.some((w) => w.endsWith(':') || w.endsWith(';'))).toBe(true);
  });

  it('punctuation ends the last sentence even when the count cuts it short', () => {
    for (let n = 1; n < 30; n++) {
      const words = generateWords({ ...base, punctuation: true }, n, createRng(n));
      expect(words.at(-1)).toMatch(/[.?!]$/);
    }
  });

  it('is deterministic for a seed', () => {
    expect(generateWords(base, 50, createRng(8))).toEqual(generateWords(base, 50, createRng(8)));
  });
});

describe('wordsForConfig', () => {
  const rng = createRng(9);

  it('time mode gives 100 words', () => {
    expect(wordsForConfig({ ...base, mode: 'time', time: 60 }, rng)).toHaveLength(100);
  });

  it('words mode gives exactly config.words words', () => {
    expect(wordsForConfig({ ...base, mode: 'words', words: 25 }, rng)).toHaveLength(25);
  });

  it('pangram mode gives the words of pangramCount pangrams', () => {
    const words = wordsForConfig({ ...base, mode: 'pangram', pangramCount: 3, language: 'pl' }, createRng(10));
    expect(isPangram(words.join(' '), 'pl')).toBe(true);
    expect(words.length).toBeGreaterThan(3 * 5);
  });

  it('custom mode splits customText on whitespace', () => {
    expect(wordsForConfig({ ...base, mode: 'custom', customText: '  alpha\nbeta\t gamma ' })).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('custom mode uses at most MAX_CUSTOM_WORDS words', () => {
    const text = Array.from({ length: MAX_CUSTOM_WORDS + 500 }, (_, i) => `w${i}`).join(' ');
    const words = wordsForConfig({ ...base, mode: 'custom', customText: text });
    expect(words).toHaveLength(MAX_CUSTOM_WORDS);
    expect(words[0]).toBe('w0');
  });

  it('custom mode falls back to the default sentence when empty', () => {
    expect(wordsForConfig({ ...base, mode: 'custom', customText: '   ' })).toEqual(DEFAULT_CUSTOM_TEXT.split(' '));
    expect(DEFAULT_CUSTOM_TEXT).toBe('the quick brown fox jumps over the lazy dog');
  });

  it('zen and quote give no words', () => {
    expect(wordsForConfig({ ...base, mode: 'zen' })).toEqual([]);
    expect(wordsForConfig({ ...base, mode: 'quote' })).toEqual([]);
  });
});

describe('quoteToWords', () => {
  it('splits on any whitespace and drops empties', () => {
    expect(quoteToWords('  To be,\n or not  to be.  ')).toEqual(['To', 'be,', 'or', 'not', 'to', 'be.']);
    expect(quoteToWords('   ')).toEqual([]);
  });
});

describe('wordsForConfig: daily and weak', () => {
  const now = Date.UTC(2026, 10, 8, 15, 30);

  it('daily gives today\'s seeded text, the same for the same UTC date and language', () => {
    const a = wordsForConfig({ ...base, mode: 'daily', language: 'de' }, createRng(1), { now });
    const b = wordsForConfig({ ...base, mode: 'daily', language: 'de' }, createRng(999), { now: now + 3_600_000 });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(40);
  });

  it('daily uses the UTC date of `now`', () => {
    const today = wordsForConfig({ ...base, mode: 'daily' }, Math.random, { now });
    const tomorrow = wordsForConfig({ ...base, mode: 'daily' }, Math.random, { now: now + 86_400_000 });
    expect(today).not.toEqual(tomorrow);
  });

  it('daily ignores the config word count and the punctuation flag', () => {
    const plain = wordsForConfig({ ...base, mode: 'daily', words: 10, punctuation: false }, Math.random, { now });
    const other = wordsForConfig({ ...base, mode: 'daily', words: 100, punctuation: true }, Math.random, { now });
    expect(plain).toEqual(other);
  });

  it('weak gives 40 words and uses the weak letters from extras', () => {
    const words = wordsForConfig({ ...base, mode: 'weak' }, createRng(2), { weakKeys: ['q', 'z'] });
    expect(words).toHaveLength(40);
    expect(words.every((w) => en.includes(w))).toBe(true);
  });

  it('weak with no extras falls back to plain words', () => {
    const words = wordsForConfig({ ...base, mode: 'weak', language: 'es' }, createRng(3));
    expect(words).toHaveLength(40);
    expect(words.every((w) => es.includes(w))).toBe(true);
  });

  it('daily and weak work for every language', () => {
    for (const language of ['en', 'pl', 'de', 'es'] as const) {
      expect(wordsForConfig({ ...base, mode: 'daily', language }, Math.random, { now }).length).toBeGreaterThan(40);
      expect(wordsForConfig({ ...base, mode: 'weak', language }, createRng(4), { weakKeys: ['x'] })).toHaveLength(40);
    }
  });

  it('keeps the two-argument call working (existing callers)', () => {
    expect(wordsForConfig({ ...base, mode: 'words', words: 10 }, createRng(5))).toHaveLength(10);
  });
});

describe('generateWords for de and es', () => {
  it('never repeats a word in a row, with numbers and punctuation', () => {
    for (const language of ['de', 'es'] as const) {
      const words = generateWords({ language, numbers: true, punctuation: true }, 1000, createRng(21));
      const bare = words.map((w) => w.replace(/^"|"$/g, '').toLowerCase().replace(/[.,?!:;]$/, ''));
      for (let i = 1; i < bare.length; i++) expect(bare[i], `repeat at ${i} (${language})`).not.toBe(bare[i - 1]);
    }
  });

  it('draws German and Spanish words from their lists', async () => {
    const { de } = await import('./wordlists/de');
    const { es } = await import('./wordlists/es');
    expect(generateWords({ language: 'de', numbers: false, punctuation: false }, 300, createRng(22)).every((w) => de.includes(w))).toBe(true);
    expect(generateWords({ language: 'es', numbers: false, punctuation: false }, 300, createRng(23)).every((w) => es.includes(w))).toBe(true);
  });
});
