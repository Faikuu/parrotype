import type { Language } from '../engine/types';
import { en } from './wordlists/en';
import { pl } from './wordlists/pl';
import { pick, shuffle, type Rng } from './rng';

export const ALPHABETS: Record<Language, string> = {
  en: 'abcdefghijklmnopqrstuvwxyz',
  pl: 'aąbcćdeęfghijklłmnńoóprsśtuwyzźż',
};

const WORDLISTS: Record<Language, readonly string[]> = { en, pl };

export interface PangramOptions {
  /** Greedy trials per pangram (default 60). */
  attempts?: number;
  /** Capitalise the first word and end with "." */
  punctuation?: boolean;
}

/** Letters of the language's alphabet that `text` does not contain (case-insensitive). */
export function missingLetters(text: string, language: Language): string[] {
  const present = new Set(text.normalize('NFC').toLowerCase());
  return [...ALPHABETS[language]].filter((letter) => !present.has(letter));
}

export function isPangram(text: string, language: Language): boolean {
  return missingLetters(text, language).length === 0;
}

function weightedIndex(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] as number;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

interface WordInfo {
  word: string;
  length: number;
  /** Indices into the alphabet of the distinct letters in the word. */
  letters: number[];
}

function analyse(language: Language): WordInfo[] {
  const alphabet = ALPHABETS[language];
  const infos: WordInfo[] = [];
  for (const word of WORDLISTS[language]) {
    const letters = new Set<number>();
    for (const ch of word.normalize('NFC').toLowerCase()) {
      const index = alphabet.indexOf(ch);
      if (index >= 0) letters.add(index);
    }
    if (letters.size > 0) infos.push({ word, length: word.length, letters: [...letters] });
  }
  return infos;
}

const analysed: Partial<Record<Language, WordInfo[]>> = {};
function wordInfos(language: Language): WordInfo[] {
  let infos = analysed[language];
  if (!infos) {
    infos = analyse(language);
    analysed[language] = infos;
  }
  return infos;
}

/**
 * One pangram as a list of words. Randomised greedy set cover: each step picks a word that adds
 * new letters, weighted by (new letters)^2 / length. Of `attempts` trials, one of the three
 * shortest is kept, its words are shuffled, and it is verified before returning.
 */
export function generatePangramWords(language: Language, rng: Rng = Math.random, opts: PangramOptions = {}): string[] {
  const alphabet = ALPHABETS[language];
  const alphabetSize = [...alphabet].length;
  const infos = wordInfos(language);

  const covered = new Set<number>();
  for (const info of infos) info.letters.forEach((l) => covered.add(l));
  if (covered.size < alphabetSize) {
    throw new Error(`Word list for "${language}" cannot cover the alphabet`);
  }

  const attempts = Math.max(1, opts.attempts ?? 60);
  const results: { words: string[]; chars: number }[] = [];

  for (let t = 0; t < attempts; t++) {
    const got = new Set<number>();
    const used = new Set<string>();
    const chosen: WordInfo[] = [];

    while (got.size < alphabetSize) {
      const candidates: WordInfo[] = [];
      const weights: number[] = [];
      for (const info of infos) {
        if (used.has(info.word)) continue;
        let fresh = 0;
        for (const l of info.letters) if (!got.has(l)) fresh++;
        if (fresh === 0) continue;
        candidates.push(info);
        weights.push((fresh * fresh) / info.length);
      }
      if (candidates.length === 0) break;
      const next = candidates[weightedIndex(weights, rng)] as WordInfo;
      chosen.push(next);
      used.add(next.word);
      next.letters.forEach((l) => got.add(l));
    }

    if (got.size === alphabetSize) {
      const chars = chosen.reduce((sum, c) => sum + c.length, 0) + chosen.length - 1;
      results.push({ words: chosen.map((c) => c.word), chars });
    }
  }

  if (results.length === 0) throw new Error(`Could not build a pangram for "${language}"`);
  results.sort((a, b) => a.chars - b.chars);
  const best = pick(results.slice(0, 3), rng);
  return shuffle(best.words, rng);
}

/** A verified pangram as a single string. */
export function generatePangram(language: Language, rng: Rng = Math.random, opts: PangramOptions = {}): string {
  let words = generatePangramWords(language, rng, opts);
  if (opts.punctuation) {
    const first = words[0] ?? '';
    words = [first.charAt(0).toLocaleUpperCase(language) + first.slice(1), ...words.slice(1)];
    words[words.length - 1] = `${words[words.length - 1]}.`;
  }
  const text = words.join(' ');
  if (!isPangram(text, language)) throw new Error('generatePangram produced a non-pangram');
  return text;
}

/** Flat word list of `count` pangrams, each verified. */
export function generatePangrams(
  language: Language,
  count: number,
  opts: { rng?: Rng; punctuation?: boolean; attempts?: number } = {},
): string[] {
  const rng = opts.rng ?? Math.random;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(...generatePangram(language, rng, opts).split(' '));
  }
  return out;
}
