import { describe, it, expect } from 'vitest';
import { en } from './wordlists/en';
import { pl } from './wordlists/pl';
import { ALPHABETS, missingLetters } from './pangram';

const lists = { en, pl } as const;

describe('word lists', () => {
  for (const language of ['en', 'pl'] as const) {
    const list = lists[language];

    it(`${language}: has about 500 words`, () => {
      expect(list.length).toBeGreaterThanOrEqual(450);
    });

    it(`${language}: has no duplicates`, () => {
      expect(new Set(list).size).toBe(list.length);
    });

    it(`${language}: words are lowercase and non-empty`, () => {
      expect(list.every((w) => w.length > 0 && w === w.toLowerCase() && !/\s/.test(w))).toBe(true);
    });

    it(`${language}: only alphabet letters`, () => {
      const allowed = new Set([...ALPHABETS[language]]);
      for (const word of list) {
        for (const ch of word) expect(allowed.has(ch), `${word} contains ${ch}`).toBe(true);
      }
    });

    it(`${language}: every alphabet letter appears in at least 3 words`, () => {
      for (const letter of ALPHABETS[language]) {
        const count = list.filter((w) => w.includes(letter)).length;
        expect(count, `letter ${letter}`).toBeGreaterThanOrEqual(3);
      }
    });

    it(`${language}: the list covers its alphabet`, () => {
      expect(missingLetters(list.join(' '), language)).toEqual([]);
    });
  }
});
