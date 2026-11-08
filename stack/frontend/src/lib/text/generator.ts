import type { Language, TestConfig } from '../engine/types';
import { en } from './wordlists/en';
import { pl } from './wordlists/pl';
import { generatePangrams } from './pangram';
import { pick, type Rng } from './rng';

const WORDLISTS: Record<Language, readonly string[]> = { en, pl };

export const DEFAULT_CUSTOM_TEXT = 'the quick brown fox jumps over the lazy dog';
/** Most words taken from a custom text, so a huge paste can't stall rendering. */
export const MAX_CUSTOM_WORDS = 2000;

const NUMBER_RATIO = 0.1;
const QUOTE_RATIO = 0.02;
const HYPHEN_RATIO = 0.02;
const COMMA_RATIO = 0.08;
const COLON_OR_SEMI_RATIO = 0.01;

function randomNumber(rng: Rng): string {
  const digits = 1 + Math.floor(rng() * 4); // 1..4 digits
  const low = 10 ** (digits - 1);
  return String(low + Math.floor(rng() * 9 * low));
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Weighted terminal punctuation: mostly '.', sometimes '?' or '!'. */
function terminal(rng: Rng): string {
  const r = rng();
  if (r < 0.8) return '.';
  return r < 0.9 ? '?' : '!';
}

/**
 * `count` words for the config's language, optionally with numbers and punctuation.
 * Never returns the same word twice in a row.
 */
export function generateWords(config: TestConfig, count: number, rng: Rng = Math.random): string[] {
  if (count <= 0) return [];
  const list = WORDLISTS[config.language];

  // Lower-cased bare word (no punctuation) for the next slot, never equal to the previous one.
  let prev = '';
  const nextBare = (): string => {
    let bare = '';
    do {
      bare = config.numbers && rng() < NUMBER_RATIO ? randomNumber(rng) : pick(list, rng);
    } while (bare === prev);
    prev = bare;
    return bare;
  };

  const out: string[] = [];
  if (!config.punctuation) {
    while (out.length < count) out.push(nextBare());
    return out;
  }

  // Sentences of 4-12 words. The last sentence is cut to fit, but always ends with punctuation.
  while (out.length < count) {
    const length = Math.min(count - out.length, 4 + Math.floor(rng() * 9));
    for (let j = 0; j < length; j++) {
      let token = nextBare();
      if (j === 0) token = capitalise(token);

      if (j === length - 1) {
        out.push(token + terminal(rng));
        continue;
      }
      if (rng() < QUOTE_RATIO) {
        token = `"${token}"`;
      } else if (rng() < HYPHEN_RATIO) {
        token = `${token}-${nextBare()}`;
      }
      if (rng() < COLON_OR_SEMI_RATIO) {
        token += rng() < 0.5 ? ':' : ';';
      } else if (rng() < COMMA_RATIO) {
        token += ',';
      }
      out.push(token);
    }
  }
  return out;
}

/** Initial word list for the config. Quote mode returns [] (the UI fetches a quote and calls quoteToWords). */
export function wordsForConfig(config: TestConfig, rng: Rng = Math.random): string[] {
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
    case 'zen':
    case 'quote':
      return [];
  }
}

export function quoteToWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}
