import { describe, it, expect } from 'vitest';
import { de } from './wordlists/de';
import { en } from './wordlists/en';
import { es } from './wordlists/es';
import { pl } from './wordlists/pl';
import { ALPHABETS, missingLetters, normalizeText } from './pangram';
import { LANGUAGES, LANGUAGE_NAMES, WORDLISTS } from './languages';
import type { Language } from '../engine/types';

const lists: Record<Language, readonly string[]> = { en, pl, de, es };

/** Accented characters a word may contain that are not alphabet letters (Spanish accents fold onto their base letter). */
const EXTRA_CHARS: Partial<Record<Language, string>> = { es: 'áéíóúü' };

describe('languages', () => {
  it('lists the four languages with names', () => {
    expect([...LANGUAGES]).toEqual(['en', 'pl', 'de', 'es']);
    expect(LANGUAGE_NAMES).toEqual({ en: 'English', pl: 'Polski', de: 'Deutsch', es: 'Español' });
    expect(WORDLISTS.de).toBe(de);
    expect(WORDLISTS.es).toBe(es);
  });
});

describe('word lists', () => {
  for (const language of ['en', 'pl', 'de', 'es'] as const) {
    const list = lists[language];
    const minimum = language === 'en' || language === 'pl' ? 450 : 380;

    it(`${language}: has about 400+ words`, () => {
      expect(list.length).toBeGreaterThanOrEqual(minimum);
    });

    it(`${language}: has no duplicates`, () => {
      expect(new Set(list).size).toBe(list.length);
    });

    it(`${language}: words are lowercase and non-empty`, () => {
      expect(list.every((w) => w.length > 0 && w === w.toLowerCase() && !/\s/.test(w))).toBe(true);
    });

    it(`${language}: only alphabet letters (plus the accents allowed for it)`, () => {
      const allowed = new Set([...ALPHABETS[language], ...(EXTRA_CHARS[language] ?? '')]);
      for (const word of list) {
        for (const ch of word) expect(allowed.has(ch), `${word} contains ${ch}`).toBe(true);
      }
    });

    it(`${language}: every alphabet letter appears in at least 3 words (accents folded)`, () => {
      for (const letter of ALPHABETS[language]) {
        const count = list.filter((w) => normalizeText(w, language).includes(letter)).length;
        expect(count, `letter ${letter}`).toBeGreaterThanOrEqual(3);
      }
    });

    it(`${language}: the list covers its alphabet`, () => {
      expect(missingLetters(list.join(' '), language)).toEqual([]);
    });
  }

  it('de: includes words with ä, ö, ü and ß, and the letters q, x, y', () => {
    for (const ch of 'äöüß') expect(de.some((w) => w.includes(ch)), ch).toBe(true);
    for (const ch of 'qxy') expect(de.some((w) => w.includes(ch)), ch).toBe(true);
    expect(de).toEqual(expect.arrayContaining(['größe', 'straße', 'mädchen', 'quelle', 'taxi', 'xylofon', 'yacht']));
  });

  it('es: includes words with ñ, k, w, x and accented vowels', () => {
    expect(es.some((w) => w.includes('ñ'))).toBe(true);
    for (const ch of 'kwx') expect(es.some((w) => w.includes(ch)), ch).toBe(true);
    for (const ch of 'áéíóú') expect(es.some((w) => w.includes(ch)), ch).toBe(true);
    expect(es).toEqual(expect.arrayContaining(['año', 'niño', 'español', 'kilo', 'kiwi', 'web', 'wifi', 'taxi', 'examen', 'éxito']));
  });
});
