import { z } from 'zod';

export const RESULT_MODES = ['time', 'words', 'quote', 'zen', 'pangram', 'custom'] as const;
export const LANGUAGES = ['en', 'pl'] as const;

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const count = z.number().int().min(0);

export const resultInputSchema = z
  .object({
    mode: z.enum(RESULT_MODES),
    mode2: z.string().min(1).max(16),
    language: z.enum(LANGUAGES),
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
    // Sanity check: wpm should roughly match correct chars over the duration.
    const estimated = r.charStats.correct / 5 / (r.durationMs / 60_000);
    if (Math.abs(estimated - r.wpm) > r.wpm * 1.5 + 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['wpm'],
        message: 'wpm does not match charStats and durationMs',
      });
    }
  });

export const resultsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Zen and custom tests can be saved but are never ranked. */
export const leaderboardQuerySchema = z.object({
  mode: z.enum(RESULT_MODES).refine((m) => m !== 'zen' && m !== 'custom', {
    message: 'zen and custom results are not ranked',
  }),
  mode2: z.string().min(1).max(16),
  language: z.enum(LANGUAGES),
});

export type ResultInput = z.infer<typeof resultInputSchema>;
export type ResultsListQuery = z.infer<typeof resultsListQuerySchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
