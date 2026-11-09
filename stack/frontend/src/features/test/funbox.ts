import type { FunboxId } from '@/store/settings';
import type { Rng } from '@/lib/text/rng';

/** Memory funbox: the words are shown this long after the start, then the upcoming ones are hidden. */
export const MEMORY_SHOW_MS = 3000;

/** The letters of one word, reversed. Letters are split by code point, so accents stay whole. */
export function reverseWord(word: string): string {
  return Array.from(word).reverse().join('');
}

/**
 * Capitalises about one word in three (the first letter only). A word whose capital is more than one
 * character (ß) is left as it is, so every target letter stays one keystroke.
 */
export function capsWords(words: readonly string[], rng: Rng = Math.random): string[] {
  return words.map((word) => {
    const first = word.charAt(0);
    if (first === '' || rng() >= 1 / 3) return word;
    const upper = first.toUpperCase();
    return upper.length === 1 ? upper + word.slice(1) : word;
  });
}

/**
 * The target words of a test with the word-changing funboxes applied (reverse, then caps). Mirror and memory
 * change only how the words are drawn, so they leave the words as they are.
 */
export function applyFunboxWords(words: readonly string[], funbox: readonly FunboxId[], rng: Rng = Math.random): string[] {
  let out = [...words];
  if (funbox.includes('reverse')) out = out.map(reverseWord);
  if (funbox.includes('caps')) out = capsWords(out, rng);
  return out;
}

/** The funboxes as shown in the config bar: the ids in their fixed order, or none. */
export function funboxLabel(funbox: readonly FunboxId[]): string {
  return funbox.join(', ');
}
