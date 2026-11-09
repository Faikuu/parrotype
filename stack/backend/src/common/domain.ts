import { z } from 'zod';

/** Languages with word lists and quotes. */
export const LANGUAGES = ['en', 'pl', 'de', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];
export const languageSchema = z.enum(LANGUAGES);

export const RESULT_MODES = [
  'time',
  'words',
  'quote',
  'zen',
  'pangram',
  'custom',
  'daily',
  'weak',
  'code',
] as const;
export type ResultMode = (typeof RESULT_MODES)[number];

/** Code results: the snippet's language, the mode2 of a code result. Saved, never ranked. */
export const CODE_LANGUAGES = ['js', 'py', 'rs', 'go'] as const;

/** Only these modes count toward leaderboards and public bests. */
export const RANKED_MODES = ['time', 'words', 'quote', 'pangram', 'daily'] as const;

export function isRankedMode(mode: string): boolean {
  return (RANKED_MODES as readonly string[]).includes(mode);
}

/** mode2 of a daily result, and the date filter of the daily board. */
export const DAILY_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
