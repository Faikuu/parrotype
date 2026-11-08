import type { Language } from '../engine/types';
import { WORDLISTS } from './languages';
import type { Rng } from './rng';

/**
 * `count` words for practising the letters in `weak`. A word is weighted by (1 + 3k)^2, where k is the
 * number of distinct weak letters it contains, so words full of weak letters come up far more often.
 * Never the same word twice in a row. With no weak letters every word has weight 1 (plain random words).
 */
export function weakKeyWords(
  weak: readonly string[],
  language: Language,
  count = 40,
  rng: Rng = Math.random,
): string[] {
  if (count <= 0) return [];
  const list = WORDLISTS[language];
  const weakSet = new Set(weak.map((letter) => letter.toLowerCase()));

  const weights = list.map((word) => {
    let k = 0;
    for (const ch of new Set(word)) if (weakSet.has(ch)) k++;
    return (1 + 3 * k) ** 2;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);

  const out: string[] = [];
  let prev = -1;
  for (let n = 0; n < count; n++) {
    // The previous word is left out of this draw, so it cannot repeat.
    const available = total - (prev >= 0 ? (weights[prev] ?? 0) : 0);
    let r = rng() * available;
    let picked = -1;
    let last = -1;
    for (let i = 0; i < list.length; i++) {
      if (i === prev) continue;
      last = i;
      r -= weights[i] ?? 0;
      if (r < 0) {
        picked = i;
        break;
      }
    }
    if (picked < 0) picked = last >= 0 ? last : Math.max(prev, 0); // single-word list: repeat is unavoidable
    out.push(list[picked] ?? '');
    prev = picked;
  }
  return out;
}
