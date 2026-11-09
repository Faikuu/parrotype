export interface FuzzyMatch {
  score: number;
  /** Indices in the text of the matched characters, ascending. */
  indices: number[];
}

const WORD_BOUNDARY = /[\s\-_/.:(]/;

/**
 * Subsequence match, case-insensitive. Scores reward consecutive characters,
 * word starts and early matches. Returns null when the query isn't a subsequence.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { score: 0, indices: [] };
  const t = text.toLowerCase();

  const indices: number[] = [];
  let score = 0;
  let qi = 0;
  let prev = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    let s = 1;
    if (ti === prev + 1) s += 4;
    if (ti === 0 || WORD_BOUNDARY.test(t[ti - 1]!)) s += 3;
    score += s;
    indices.push(ti);
    prev = ti;
    qi++;
  }
  if (qi < q.length) return null;

  // Penalise gaps between matched characters and a late first match.
  for (let i = 1; i < indices.length; i++) {
    score -= Math.min(indices[i]! - indices[i - 1]! - 1, 5) * 0.5;
  }
  score -= indices[0]! * 0.1;
  if (t.includes(q)) score += 10;

  return { score, indices };
}

export interface FuzzyResult<T> {
  item: T;
  score: number;
  /** Matched indices in the label, for highlighting. */
  indices: number[];
}

/**
 * Filters and ranks items by label, with keywords as a fallback match
 * (keyword matches don't highlight the label). Stable for equal scores.
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  getLabel: (item: T) => string,
  getKeywords: (item: T) => readonly string[] = () => [],
): FuzzyResult<T>[] {
  if (query.trim().length === 0) {
    return items.map((item) => ({ item, score: 0, indices: [] }));
  }
  const results: (FuzzyResult<T> & { order: number })[] = [];
  items.forEach((item, order) => {
    const label = fuzzyMatch(query, getLabel(item));
    if (label) {
      results.push({ item, score: label.score + 5, indices: label.indices, order });
      return;
    }
    let best: number | null = null;
    for (const kw of getKeywords(item)) {
      const m = fuzzyMatch(query, kw);
      if (m && (best === null || m.score > best)) best = m.score;
    }
    if (best !== null) results.push({ item, score: best, indices: [], order });
  });
  results.sort((a, b) => b.score - a.score || a.order - b.order);
  return results.map(({ item, score, indices }) => ({ item, score, indices }));
}
