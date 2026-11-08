import type { TestConfig } from '../engine/types';
import { dailyWords, utcDateString } from './daily';
import type { Rng } from './rng';
import { generatePangrams } from './pangram';
import { generateWords } from './words';
import { weakKeyWords } from './weak';

export { generateWords } from './words';
export type { WordOptions } from './words';

export const DEFAULT_CUSTOM_TEXT = 'the quick brown fox jumps over the lazy dog';
/** Most words taken from a custom text, so a huge paste can't stall rendering. */
export const MAX_CUSTOM_WORDS = 2000;
/** Words in a weak-keys test. */
export const WEAK_WORD_COUNT = 40;

/** Inputs that only some modes need: the weakest letters (weak mode) and the clock (daily mode). */
export interface WordsExtras {
  weakKeys?: readonly string[];
  /** Epoch ms; the daily text uses this day's UTC date. Defaults to now. */
  now?: number;
}

/**
 * Initial word list for the config. Quote and zen give []. Daily ignores `rng` (it is seeded
 * from the date and language). Weak uses `rng` with `extras.weakKeys`.
 */
export function wordsForConfig(config: TestConfig, rng: Rng = Math.random, extras: WordsExtras = {}): string[] {
  switch (config.mode) {
    case 'time':
      return generateWords(config, 100, rng);
    case 'words':
      return generateWords(config, config.words, rng);
    case 'pangram':
      return generatePangrams(config.language, config.pangramCount, {
        rng,
        punctuation: config.punctuation,
      });
    case 'custom': {
      const words = config.customText
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .slice(0, MAX_CUSTOM_WORDS);
      return words.length > 0 ? words : DEFAULT_CUSTOM_TEXT.split(' ');
    }
    case 'daily':
      return dailyWords(utcDateString(extras.now ?? Date.now()), config.language);
    case 'weak':
      return weakKeyWords(extras.weakKeys ?? [], config.language, WEAK_WORD_COUNT, rng);
    case 'zen':
    case 'quote':
      return [];
  }
}

export function quoteToWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}
