/**
 * Where a pace caret sits after typing at `wpm` for `elapsedMs`: the caret has walked the target text
 * (words joined by single spaces) for wpm × 5 × elapsedMs / 60000 chars. Returns null when wpm <= 0,
 * when there are no words, or when the walk reaches the end of the text.
 */
export function pacePosition(
  words: readonly string[],
  wpm: number,
  elapsedMs: number,
): { word: number; char: number } | null {
  if (!(wpm > 0) || words.length === 0) return null;
  let left = Math.floor((wpm * 5 * Math.max(0, elapsedMs)) / 60000);
  const last = words.length - 1;
  for (let i = 0; i <= last; i++) {
    const len = words[i]?.length ?? 0;
    if (left < len) return { word: i, char: left };
    if (i === last) return null; // at or past the end of the text
    if (left === len) return { word: i, char: len }; // right after the word, before its space
    left -= len + 1; // skip the word and the space after it
  }
  return null;
}
