import { z } from 'zod';
import { utcDate } from '../common/dates';
import { CODE_LANGUAGES, DAILY_DATE_REGEX, isRankedMode, languageSchema, RESULT_MODES, type ResultMode } from '../common/domain';
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
  code: CODE_LANGUAGES,
};

/** The message for a mode that is saved but never ranked. */
export const UNRANKED_MESSAGE = 'zen, custom, weak and code results are not ranked';
/** Scopes of the leaderboard. "following" needs a signed-in viewer (checked by the controller). */
export const LEADERBOARD_SCOPES = ['all', 'following'] as const;

/** Modes a result can be saved in. "event" is a result of a timed event: mode2 is the event slug. */
export const SUBMIT_MODES = [...RESULT_MODES, 'event'] as const;
export type SubmitMode = (typeof SUBMIT_MODES)[number];

/** Event slugs, as the admin API makes them (src/events). */
export const EVENT_SLUG_REGEX = /^[a-z0-9-]{3,40}$/;

// Replay caps. The body limit for POST /api/results is larger than the default 50 KB to fit these (app.setup.ts).
export const REPLAY_VERSION = 1;
export const REPLAY_MAX_WORDS = 2000;
export const REPLAY_MAX_WORD_LENGTH = 40;
export const REPLAY_MAX_EVENTS = 20_000;
/** Longest time an event can be logged at: results last at most an hour (durationMs cap). */
export const REPLAY_MAX_T_MS = 3_600_000;
/** Longest indent of a code line, in spaces. */
const REPLAY_MAX_INDENT = 200;

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

const EVENT_KINDS = ['c', 's', 'b', 'B', 'n'] as const;
/** One printable character: not whitespace, not a control or format character. */
const TYPED_CHAR = /^[^\s\p{C}]$/u;

/** One accepted input action of a replay. See EngineEvent (stack/engine/src/engine/types.ts). */
export const replayEventSchema = z
  .object({
    t: z.number().int().min(0).max(REPLAY_MAX_T_MS),
    k: z.enum(EVENT_KINDS),
    ch: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.k === 'c' && (e.ch === undefined || !TYPED_CHAR.test(e.ch))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ch'], message: 'a "c" event needs one printable character' });
    }
    if (e.k !== 'c' && e.ch !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ch'], message: 'only a "c" event has ch' });
    }
  });

/**
 * The keystroke replay a result is verified with. `words` is the target text (for time mode, the final list,
 * with the words appended during the test). Zen ignores it. Only the fields the engine needs are kept.
 */
export const replaySchema = z
  .object({
    v: z.literal(REPLAY_VERSION),
    words: z.array(z.string().max(REPLAY_MAX_WORD_LENGTH)).max(REPLAY_MAX_WORDS),
    events: z.array(replayEventSchema).max(REPLAY_MAX_EVENTS),
    code: z
      .object({
        breaks: z.array(z.boolean()).max(REPLAY_MAX_WORDS),
        indent: z.array(z.number().int().min(0).max(REPLAY_MAX_INDENT)).max(REPLAY_MAX_WORDS),
      })
      .optional(),
  })
  .superRefine((r, ctx) => {
    // The live run logs its first character at t 0 (its start), and nothing before it is logged.
    if (r.events.length > 0 && (r.events[0].t !== 0 || r.events[0].k !== 'c')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['events', 0], message: 'the first event must be a "c" at t 0' });
    }
    let previous = 0;
    r.events.forEach((e, i) => {
      if (e.t < previous) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['events', i, 't'], message: 't must not decrease' });
      }
      previous = e.t;
    });
    if (r.code && (r.code.breaks.length !== r.words.length || r.code.indent.length !== r.words.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['code'],
        message: 'code breaks and indent need one entry per word',
      });
    }
  });

export type Replay = z.infer<typeof replaySchema>;

export const resultInputSchema = z
  .object({
    mode: z.enum(SUBMIT_MODES),
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
    /** Optional for every mode. Event results must have one; the server verifies it (src/results/replay-verify.ts). */
    replay: replaySchema.optional(),
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
    if (r.mode === 'event') {
      if (!EVENT_SLUG_REGEX.test(r.mode2)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mode2'], message: 'event mode2 must be the event slug' });
      }
      if (!r.replay) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['replay'], message: 'Event results need a replay' });
      }
      return;
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
    } else {
      const problem = mode2Problem(r.mode, r.mode2);
      if (problem) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mode2'], message: problem });
      }
    }
    if (r.mode === 'code' && r.language !== 'en') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['language'],
        message: 'code results must have language "en"',
      });
    }
    if (r.replay?.code && r.mode !== 'code') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['replay', 'code'], message: 'replay.code is only for code results' });
    }
    if (r.mode === 'code' && r.replay && !r.replay.code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['replay', 'code'], message: 'code results need replay.code' });
    }
  });

export const resultsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const rankedModeField = z.enum(RESULT_MODES).refine((m) => isRankedMode(m), { message: UNRANKED_MESSAGE });
const mode2Field = z.string().min(1).max(16);

/** Adds the mode2 check for a ranked mode. Unranked modes already failed their own refinement. */
function checkRankedFilter(q: { mode: ResultMode; mode2: string }, ctx: z.RefinementCtx): void {
  if (!isRankedMode(q.mode)) return;
  const problem = mode2Problem(q.mode, q.mode2);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mode2'], message: problem });
}

/**
 * Zen, custom, weak and code tests can be saved but are never ranked. Boards list only verified results (whose
 * replay the server checked) by default. `verified=false` includes unverified results too; `verified=true` (or
 * no parameter) is the verified-only board. The parsed `verified` is true unless the parameter is `false`.
 */
export const leaderboardQuerySchema = z
  .object({
    mode: rankedModeField,
    mode2: mode2Field,
    language: languageSchema,
    scope: z.enum(LEADERBOARD_SCOPES).default('all'),
    verified: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v !== 'false'),
  })
  .superRefine(checkRankedFilter);

/** The badge shows the best wpm of one ranked filter. Defaults: time, 60 seconds, English. */
export const badgeQuerySchema = z
  .object({
    mode: rankedModeField.default('time'),
    mode2: mode2Field.default('60'),
    language: languageSchema.default('en'),
  })
  .superRefine(checkRankedFilter);

export const exportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS).default('csv'),
});

export type ResultInput = z.infer<typeof resultInputSchema>;
export type ResultsListQuery = z.infer<typeof resultsListQuerySchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type BadgeQuery = z.infer<typeof badgeQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
