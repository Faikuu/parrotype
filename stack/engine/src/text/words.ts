import type { TestConfig } from '../engine/types';
import { WORDLISTS } from './languages';
import { pick, type Rng } from './rng';

export type WordOptions = Pick<TestConfig, 'language' | 'punctuation' | 'numbers'>;

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
export function generateWords(config: WordOptions, count: number, rng: Rng = Math.random): string[] {
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
