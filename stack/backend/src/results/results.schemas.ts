import { z } from 'zod';
import { utcDate } from '../common/dates';
import { DAILY_DATE_REGEX, isRankedMode, languageSchema, RESULT_MODES, type ResultMode } from '../common/domain';
import { EXPORT_FORMATS } from './export';

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const count = z.number().int().min(0);

/**
 * The mode2 values the frontend sends for each mode (mode2Of in stack/frontend/src/features/test/useTypingTest.ts).
 * Daily is not listed: its mode2 is a date, checked separately.
 */
const FIXED_MODE2: Record<Exclude<ResultMode, 'daily'>, readonly string[]> = {
  time: ['15', '30', '60', '120'],
  words: ['10', '25', '50', '100'],
  quote: ['short', 'medium', 'long', 'any'],
  pangram: ['1', '3', '5'],
  zen: ['zen'],
  custom: ['custom'],
  weak: ['weak'],
};

/** Why mode2 does not fit the mode, or null. A daily mode2 must be a well-formed date. */
export function mode2Problem(mode: ResultMode, mode2: string): string | null {
  if (mode === 'daily') {
    return DAILY_DATE_REGEX.test(mode2) ? null : 'daily mode2 must be a date (YYYY-MM-DD)';
  }
  const allowed = FIXED_MODE2[mode];
  if (allowed.includes(mode2)) return null;
  const expected = allowed.length === 1 ? `"${allowed[0]}"` : `one of ${allowed.join(', ')}`;
  return `${mode} results must have mode2 ${expected}`;
}

export const resultInputSchema = z
  .object({
    mode: z.enum(RESULT_MODES),
    mode2: z.string().min(1).max(16),
    language: languageSchema,
    wpm: num(0, 350),
    rawWpm: num(0, 400),
    accuracy: num(0, 100),
    consistency: num(0, 100),
    durationMs: z.number().int().min(1000).max(3_600_000),
    charStats: z.object({
      correct: count,
      incorrect: count,
      extra: count,
      missed: count,
    }),
    punctuation: z.boolean(),
    numbers: z.boolean(),
  })
  .superRefine((r, ctx) => {
    if (r.wpm > r.rawWpm + 0.5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['wpm'],
        message: 'wpm cannot be higher than rawWpm',
      });
    }
    // Sanity check: the keystrokes implied by charStats, over the duration, should roughly
    // match rawWpm. Every typed character counts (correct, incorrect and extra), since raw
    // speed does not depend on accuracy. Spaces are not in charStats; for short words they
    // can add about 25%, so the tolerance is generous. wpm is not checked here: it only
    // counts fully correct words, so it can be 0 for a fast test with many single-letter errors.
    const typedChars = r.charStats.correct + r.charStats.incorrect + r.charStats.extra;
    const estimatedRaw = typedChars / 5 / (r.durationMs / 60_000);
    if (Math.abs(estimatedRaw - r.rawWpm) > r.rawWpm * 0.5 + 15) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rawWpm'],
        message: 'rawWpm does not match charStats and durationMs',
      });
    }
    if (r.mode === 'daily') {
      // A grace day for tests that cross midnight (UTC).
      const current = r.mode2 === utcDate(0) || r.mode2 === utcDate(-1);
      if (!DAILY_DATE_REGEX.test(r.mode2) || !current) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mode2'],
          message: "Daily results are only accepted for today's challenge",
        });
      }
    }
    if (r.mode !== 'daily') {
      const problem = mode2Problem(r.mode, r.mode2);
      if (problem) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mode2'], message: problem });
      }
    }
  });

export const resultsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Zen, custom and weak tests can be saved but are never ranked. */
export const leaderboardQuerySchema = z
  .object({
    mode: z.enum(RESULT_MODES).refine((m) => isRankedMode(m), {
      message: 'zen, custom and weak results are not ranked',
    }),
    mode2: z.string().min(1).max(16),
    language: languageSchema,
  })
  .superRefine((q, ctx) => {
    // Unranked modes already failed the refinement above.
    if (!isRankedMode(q.mode)) return;
    const problem = mode2Problem(q.mode, q.mode2);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mode2'], message: problem });
  });

export const exportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS).default('csv'),
});

export type ResultInput = z.infer<typeof resultInputSchema>;
export type ResultsListQuery = z.infer<typeof resultsListQuerySchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
