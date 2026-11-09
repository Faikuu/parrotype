/** Refused when a quote write would leave its language with no quotes at all (quotes are picked per language). */
export const LAST_QUOTE = 'Each language needs at least one quote';

/** The guard: `remaining` is the number of OTHER quotes in the language the write leaves. */
export function keepsQuoteInLanguage(remaining: number): boolean {
  return remaining >= 1;
}
