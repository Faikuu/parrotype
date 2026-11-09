import type { Language } from '../engine/types';
import { generatePangrams } from './pangram';
import { createRng } from './rng';
import { generateWords } from './words';

/** Words after the pangram in the daily text. */
export const DAILY_WORD_COUNT = 40;

/**
 * The daily text is derived from the word lists and the pangram generator, so changing either one
 * changes today's text for everyone (and the text for every past date). Keep the lists stable.
 */

/** The UTC calendar date of `now` as 'YYYY-MM-DD'. */
export function utcDateString(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** 32-bit FNV-1a hash of `parrotype-daily:<date>:<language>`. */
export function dailySeed(date: string, language: Language): number {
  const text = `parrotype-daily:${date}:${language}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The same date and language always give the same words. */
export function dailyWords(date: string, language: Language): string[] {
  const rng = createRng(dailySeed(date, language));
  const pangram = generatePangrams(language, 1, { rng, punctuation: true });
  const words = generateWords({ language, punctuation: true, numbers: false }, DAILY_WORD_COUNT, rng);
  return [...pangram, ...words];
}
