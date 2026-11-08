import type { Language } from '../engine/types';
import { WORDLISTS } from './languages';
import { pick, shuffle, type Rng } from './rng';

/**
 * Letters each language needs in a pangram. Umlauts and ß count as their own letters in German.
 * Spanish accents fold onto their base letter (see normalizeText); ñ is its own letter.
 */
export const ALPHABETS: Record<Language, string> = {
  en: 'abcdefghijklmnopqrstuvwxyz',
  pl: 'aąbcćdeęfghijklłmnńoóprsśtuwyzźż',
  de: 'abcdefghijklmnopqrstuvwxyzäöüß',
  es: 'abcdefghijklmnñopqrstuvwxyz',
};

const ES_NTILDE_PLACEHOLDER = '';

/**
 * Lower-cases `text` and maps it onto the alphabet of `language`.
 * - es: accents are stripped (á → a, ü → u) but ñ is kept, via a placeholder around NFD.
 * - en, pl, de: only NFC composition and lower-casing, so ä ö ü ß and the Polish letters stay as they are.
 */
export function normalizeText(text: string, language: Language): string {
  const lower = text.normalize('NFC').toLowerCase();
  if (language !== 'es') return lower;
  return lower
    .replace(/ñ/g, ES_NTILDE_PLACEHOLDER)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(new RegExp(ES_NTILDE_PLACEHOLDER, 'g'), 'ñ');
}

export interface PangramOptions {
  /** Greedy trials per pangram (default 60). */
  attempts?: number;
  /** Capitalise the first word and end with "." */
  punctuation?: boolean;
}

/** Letters of the language's alphabet that `text` does not contain (case-insensitive). */
export function missingLetters(text: string, language: Language): string[] {
  const present = new Set(normalizeText(text, language));
  return [...ALPHABETS[language]].filter((letter) => !present.has(letter));
}

export function isPangram(text: string, language: Language): boolean {
  return missingLetters(text, language).length === 0;
}

interface WordInfo {
  word: string;
  length: number;
  /** Bitmask over the alphabet indices of the distinct letters in the word (every alphabet is under 31 letters). */
  mask: number;
}

function popcount(x: number): number {
  let v = x >>> 0;
  let count = 0;
  while (v !== 0) {
    v &= v - 1;
    count++;
  }
  return count;
}

function analyse(language: Language): WordInfo[] {
  const alphabet = ALPHABETS[language];
  const infos: WordInfo[] = [];
  for (const word of WORDLISTS[language]) {
    let mask = 0;
    for (const ch of normalizeText(word, language)) {
      const index = alphabet.indexOf(ch);
      if (index >= 0) mask = (mask | (1 << index)) >>> 0;
    }
    if (mask !== 0) infos.push({ word, length: word.length, mask });
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
  const alphabetSize = [...ALPHABETS[language]].length;
  const full = (2 ** alphabetSize - 1) >>> 0;
  const infos = wordInfos(language);

  let coverable = 0;
  for (const info of infos) coverable = (coverable | info.mask) >>> 0;
  if (coverable !== full) {
    throw new Error(`Word list for "${language}" cannot cover the alphabet`);
  }

  const attempts = Math.max(1, opts.attempts ?? 60);
  const results: { words: string[]; chars: number }[] = [];
  const weights: number[] = new Array<number>(infos.length).fill(0);
  const fresh: number[] = new Array<number>(infos.length).fill(0);

  for (let t = 0; t < attempts; t++) {
    let got = 0;
    const used: boolean[] = new Array<boolean>(infos.length).fill(false);
    const chosen: WordInfo[] = [];

    while (got !== full) {
      let total = 0;
      for (let k = 0; k < infos.length; k++) {
        const info = infos[k] as WordInfo;
        const n = used[k] ? 0 : popcount(info.mask & ~got);
        fresh[k] = n;
        weights[k] = n === 0 ? 0 : (n * n) / info.length;
        total += weights[k] as number;
      }
      if (total === 0) break;
      // Weighted pick over candidates with weight > 0.
      let r = rng() * total;
      let pickedIndex = -1;
      for (let k = 0; k < infos.length; k++) {
        const w = weights[k] as number;
        if (w === 0) continue;
        pickedIndex = k;
        r -= w;
        if (r < 0) break;
      }
      const next = infos[pickedIndex] as WordInfo;
      used[pickedIndex] = true;
      chosen.push(next);
      got = (got | next.mask) >>> 0;
    }

    if (got === full) {
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
