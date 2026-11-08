import { describe, it, expect } from 'vitest';
import { ALPHABETS, generatePangram, generatePangrams, isPangram, missingLetters } from './pangram';
import { createRng } from './rng';
import type { Language } from '../engine/types';

const languages: Language[] = ['en', 'pl'];

describe('isPangram / missingLetters', () => {
  it('detects the classic English pangram', () => {
    expect(isPangram('The quick brown fox jumps over the lazy dog', 'en')).toBe(true);
    expect(missingLetters('the quick brown fox', 'en')).toEqual(['a', 'd', 'g', 'j', 'l', 'm', 'p', 's', 'v', 'y', 'z']);
  });

  it('lists missing letters in alphabet order', () => {
    expect(missingLetters('abc', 'en').slice(0, 3)).toEqual(['d', 'e', 'f']);
    expect(missingLetters('abc', 'en')).toHaveLength(23);
  });

  it('is case-insensitive', () => {
    expect(isPangram('SPHINX OF BLACK QUARTZ JUDGE MY VOW', 'en')).toBe(true);
  });

  it('ignores q, v and x for Polish', () => {
    expect(missingLetters('ą ć ę ł ń ó ś ź ż a b c d e f g h i j k l m n o p r s t u w y z', 'pl')).toEqual([]);
    expect(isPangram('abc', 'pl')).toBe(false);
  });

  it('requires Polish diacritic letters', () => {
    const text = 'aąbcćdeęfghijklłmnoprsśtuwyzż';
    expect(missingLetters(text, 'pl')).toEqual(['ń', 'ó', 'ź']);
  });

  it('exposes the alphabets', () => {
    expect(ALPHABETS.en).toBe('abcdefghijklmnopqrstuvwxyz');
    expect(ALPHABETS.pl).toHaveLength(32);
  });
});

describe('generatePangram', () => {
  for (const language of languages) {
    it(`returns a verified pangram for 200 seeds (${language})`, () => {
      for (let seed = 1; seed <= 200; seed++) {
        const text = generatePangram(language, createRng(seed));
        expect(isPangram(text, language), `seed ${seed}: ${text}`).toBe(true);
      }
    });

    it(`is deterministic for the same seed (${language})`, () => {
      const a = generatePangram(language, createRng(42));
      const b = generatePangram(language, createRng(42));
      expect(a).toBe(b);
    });

    it(`has no repeated word within a pangram (${language})`, () => {
      for (let seed = 1; seed <= 50; seed++) {
        const words = generatePangram(language, createRng(seed)).split(' ');
        expect(new Set(words).size).toBe(words.length);
      }
    });
  }

  it('punctuation: capitalised first word and a trailing period', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const text = generatePangram('en', createRng(seed), { punctuation: true });
      expect(text).toMatch(/^[A-Z][a-z]*( [a-z]+)*\.$/);
      expect(isPangram(text, 'en')).toBe(true);
    }
  });

  it('punctuation for Polish capitalises a diacritic first letter correctly', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const text = generatePangram('pl', createRng(seed), { punctuation: true });
      expect(text.endsWith('.')).toBe(true);
      expect(text.charAt(0)).toBe(text.charAt(0).toUpperCase());
      expect(isPangram(text, 'pl')).toBe(true);
    }
  });

  it('no punctuation by default', () => {
    const text = generatePangram('en', createRng(7));
    expect(text).toBe(text.toLowerCase());
    expect(text).not.toMatch(/[.,!?]/);
  });

  it('shorter attempts still produce a pangram', () => {
    expect(isPangram(generatePangram('en', createRng(3), { attempts: 1 }), 'en')).toBe(true);
  });
});

describe('generatePangrams', () => {
  it('returns the flat word list of `count` pangrams', () => {
    const words = generatePangrams('en', 3, { rng: createRng(5) });
    expect(words.length).toBeGreaterThan(3 * 5);
    expect(words.every((w) => w.length > 0 && !w.includes(' '))).toBe(true);
    expect(isPangram(words.join(' '), 'en')).toBe(true);
  });

  it('count 1 equals one pangram', () => {
    const words = generatePangrams('pl', 1, { rng: createRng(9) });
    expect(words.join(' ')).toBe(generatePangram('pl', createRng(9)));
  });

  it('is deterministic for a seeded rng', () => {
    expect(generatePangrams('pl', 5, { rng: createRng(11) })).toEqual(generatePangrams('pl', 5, { rng: createRng(11) }));
  });
});
