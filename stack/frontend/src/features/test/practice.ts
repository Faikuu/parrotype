/** Words in a "practice these words" text. */
export const PRACTICE_WORDS = 30;

/**
 * A custom text of about `target` words made from `words`: each pass through the list is shuffled, so
 * the same words come back in a different order. Empty when there are no words.
 */
export function practiceText(
  words: readonly string[],
  target = PRACTICE_WORDS,
  random: () => number = Math.random,
): string {
  const pool = words.filter((w) => w.length > 0);
  if (pool.length === 0) return '';
  const out: string[] = [];
  while (out.length < target) {
    const pass = pool.slice();
    for (let i = pass.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pass[i], pass[j]] = [pass[j]!, pass[i]!];
    }
    out.push(...pass);
  }
  return out.slice(0, target).join(' ');
}
