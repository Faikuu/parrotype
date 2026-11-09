import { describe, it, expect } from 'vitest';
import { weakKeyWords } from './weak';
import { WORDLISTS } from './languages';
import { createRng } from './rng';

const WEAK = ['q', 'z', 'x', 'j', 'k'];

function weakLetterCount(words: string[], weak: string[]): number {
  let n = 0;
  for (const w of words) for (const ch of w) if (weak.includes(ch)) n++;
  return n;
}

describe('weakKeyWords', () => {
  it('returns the requested count of words from the language list', () => {
    const words = weakKeyWords(WEAK, 'en', 40, createRng(1));
    expect(words).toHaveLength(40);
    expect(words.every((w) => WORDLISTS.en.includes(w))).toBe(true);
    expect(weakKeyWords(WEAK, 'de', 0, createRng(1))).toEqual([]);
  });

  it('defaults to 40 words', () => {
    expect(weakKeyWords(WEAK, 'es', undefined, createRng(2))).toHaveLength(40);
  });

  it('never repeats the same word twice in a row', () => {
    for (const language of ['en', 'pl', 'de', 'es'] as const) {
      const words = weakKeyWords(['q', 'z'], language, 2000, createRng(3));
      for (let i = 1; i < words.length; i++) expect(words[i], `${language} at ${i}`).not.toBe(words[i - 1]);
    }
  });

  it('with no weak letters it gives plain words (no bias, no repeats in a row)', () => {
    const words = weakKeyWords([], 'en', 2000, createRng(4));
    expect(words.every((w) => WORDLISTS.en.includes(w))).toBe(true);
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1]);
  });

  it('is deterministic for a seed', () => {
    expect(weakKeyWords(WEAK, 'en', 40, createRng(5))).toEqual(weakKeyWords(WEAK, 'en', 40, createRng(5)));
  });

  it('biases toward the weak letters: they appear much more often than in plain words (2000 words)', () => {
    const weakWords = weakKeyWords(WEAK, 'en', 2000, createRng(6));
    const plainWords = weakKeyWords([], 'en', 2000, createRng(6));
    const letters = (words: string[]) => words.reduce((n, w) => n + w.length, 0);

    const weakRate = weakLetterCount(weakWords, WEAK) / letters(weakWords);
    const baseRate = weakLetterCount(plainWords, WEAK) / letters(plainWords);
    expect(weakRate).toBeGreaterThan(baseRate * 2);

    // The share of words containing at least one weak letter also rises clearly.
    const share = (words: string[]) => words.filter((w) => [...w].some((ch) => WEAK.includes(ch))).length / words.length;
    expect(share(weakWords)).toBeGreaterThan(share(plainWords) * 1.5);
  });

  it('a word with more distinct weak letters is picked more often than one with none', () => {
    const weak = ['q', 'x', 'z'];
    const k = (w: string) => new Set([...w].filter((c) => weak.includes(c))).size;
    const heavy = WORDLISTS.en.find((w) => k(w) >= 2);
    const none = WORDLISTS.en.find((w) => k(w) === 0);
    expect(heavy).toBeDefined();
    expect(none).toBeDefined();
    const words = weakKeyWords(weak, 'en', 4000, createRng(7));
    const count = (w: string | undefined) => words.filter((x) => x === w).length;
    expect(count(heavy)).toBeGreaterThan(3 * count(none));
  });
});
