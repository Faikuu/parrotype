import {
  computeResult,
  createInitialState,
  dailyWords,
  engineReducer,
  eventAction,
  quoteToWords,
  type CodeLanguage,
  type EngineState,
  type Keystroke,
  type Language,
  type Mode,
  type PangramCount,
  type QuoteLength,
  type TestConfig,
  type TestResult,
  type TimeOption,
  type WordsOption,
} from '@parrotype/engine';
import type { Replay, ResultInput } from './results.schemas';

/** The fields a result is checked against. */
export type VerifyInput = Pick<
  ResultInput,
  'mode' | 'mode2' | 'language' | 'punctuation' | 'numbers' | 'wpm' | 'rawWpm' | 'accuracy' | 'consistency' | 'durationMs' | 'charStats'
>;

export type StopOnError = TestConfig['stopOnError'];

/** The settings a result does not record. Each value is tried, since only the one the test used reproduces it. */
const STOP_ON_ERROR: readonly StopOnError[] = ['off', 'letter', 'word'];

/** Tolerances on the submitted stats (the frontend rounds to 2 decimals). */
export const RATE_TOLERANCE = 0.5;
export const PERCENT_TOLERANCE = 0.5;
export const DURATION_TOLERANCE_MS = 200;

/** The engine's samples are one per whole second: the frontend ticks every 100 ms. */
const SAMPLE_STEP_MS = 1000;
/**
 * The frontend ticks about every 100 ms, so the last whole second before a finish may or may not have a
 * sample. Within this many ms after a whole second, both outcomes are tried.
 */
export const TICK_JITTER_MS = 150;

/** Mode, mode2 and the flags a result records, mapped to the engine config the frontend ran. */
export function configFor(
  input: Pick<VerifyInput, 'mode' | 'mode2' | 'language' | 'punctuation' | 'numbers'>,
  stopOnError: StopOnError = 'off',
): TestConfig {
  const base: TestConfig = {
    mode: 'words',
    time: 60,
    words: 10,
    quoteLength: 'any',
    pangramCount: 1,
    punctuation: input.punctuation,
    numbers: input.numbers,
    language: input.language as Language,
    customText: '',
    codeLanguage: 'js',
    stopOnError,
    noBackspace: false,
    suddenDeath: false,
  };
  switch (input.mode) {
    case 'time':
      return { ...base, mode: 'time', time: Number(input.mode2) as TimeOption };
    case 'words':
      return { ...base, mode: 'words', words: Number(input.mode2) as WordsOption };
    case 'quote':
      return { ...base, mode: 'quote', quoteLength: input.mode2 as QuoteLength };
    case 'pangram':
      return { ...base, mode: 'pangram', pangramCount: Number(input.mode2) as PangramCount };
    case 'code':
      return { ...base, mode: 'code', codeLanguage: input.mode2 as CodeLanguage };
    case 'event':
      // An event is a fixed text typed to its last word, like a custom text.
      return { ...base, mode: 'custom' };
    default:
      return { ...base, mode: input.mode as Mode };
  }
}

/** Index of the first keystroke at or after `at`, in a list sorted by time. */
function firstAtOrAfter(keys: readonly Keystroke[], at: number): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((keys[mid]?.at ?? 0) < at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Runs the replay the way the frontend's live run went: the keystrokes through the reducer, a sample tick at
 * every whole second (the samples feed consistency), and the finish. Time mode ends at its configured time,
 * which the timer, not a keystroke, decides, so the final tick sits at that time.
 *
 * `skipSample` leaves out the tick at that second (see candidateSkips).
 *
 * Speed: the reducer copies its keystroke list on every key, and a tick reads the keystrokes of the seconds it
 * samples. So the list the reducer sees is kept short: each tick gets only the keystrokes of the seconds it adds,
 * and the full list is kept here and given to the result at the end. The reducer's event log is not read here
 * either, so it is cleared before each step. The results are the same as with the full lists (the tests check
 * that against a plain run), and the work is linear in the number of events.
 */
export function playReplay(config: TestConfig, replay: Replay, skipSample: number | null): EngineState {
  const limit = config.mode === 'time' ? config.time * 1000 : Infinity;
  const extras = replay.code ? { code: replay.code } : {};
  let state = createInitialState(config, replay.words, extras);
  const keys: Keystroke[] = [];
  let nextTick = SAMPLE_STEP_MS;

  const tick = (at: number): void => {
    const start = state.startedAt;
    if (start !== null) {
      // The seconds this tick adds are those after the samples so far, up to the whole seconds elapsed at `at`.
      const elapsed = Math.min(Math.max(0, at - start), limit);
      const from = start + state.samples.length * SAMPLE_STEP_MS;
      const to = start + Math.floor(elapsed / SAMPLE_STEP_MS) * SAMPLE_STEP_MS;
      const window = keys.slice(firstAtOrAfter(keys, from), firstAtOrAfter(keys, to));
      state = engineReducer({ ...state, keystrokes: window }, { type: 'tick', at });
    } else {
      state = engineReducer(state, { type: 'tick', at });
    }
    state = { ...state, keystrokes: [] };
  };
  // Issues the ticks due at or before `until`. Time mode's final tick is issued by the caller.
  const tickThrough = (until: number): void => {
    while (nextTick <= until && nextTick < limit) {
      if (nextTick !== skipSample) tick(nextTick);
      nextTick += SAMPLE_STEP_MS;
    }
  };

  for (const e of replay.events) {
    tickThrough(e.t);
    state = engineReducer({ ...state, events: [], keystrokes: [] }, eventAction(e));
    keys.push(...state.keystrokes);
  }
  if (limit !== Infinity) {
    tickThrough(limit);
    tick(limit);
  }
  return { ...state, keystrokes: keys, events: [] };
}

/** The second whose sample may be missing before a finish at `end`, or null. Only for non-time modes. */
function candidateSkips(config: TestConfig, end: number): Array<number | null> {
  const skips: Array<number | null> = [null];
  if (config.mode !== 'time' && end >= SAMPLE_STEP_MS && end % SAMPLE_STEP_MS < TICK_JITTER_MS) {
    skips.push(Math.floor(end / SAMPLE_STEP_MS) * SAMPLE_STEP_MS);
  }
  return skips;
}

/** The submitted fields that differ from the replayed result, or none. */
export function statMismatches(input: VerifyInput, result: TestResult): string[] {
  const out: string[] = [];
  const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
  if (!near(input.wpm, result.wpm, RATE_TOLERANCE)) out.push('wpm');
  if (!near(input.rawWpm, result.rawWpm, RATE_TOLERANCE)) out.push('rawWpm');
  if (!near(input.accuracy, result.accuracy, PERCENT_TOLERANCE)) out.push('accuracy');
  if (!near(input.consistency, result.consistency, PERCENT_TOLERANCE)) out.push('consistency');
  if (!near(input.durationMs, result.durationMs, DURATION_TOLERANCE_MS)) out.push('durationMs');
  const cs = input.charStats;
  if (
    cs.correct !== result.charStats.correct ||
    cs.incorrect !== result.charStats.incorrect ||
    cs.extra !== result.charStats.extra ||
    cs.missed !== result.charStats.missed
  ) {
    out.push('charStats');
  }
  return out;
}

export interface ReplayMatch {
  matched: boolean;
  /** Why it did not match (the first attempt's fields), empty when it matched. */
  fields: string[];
}

/** The replayed state that reproduces the stats, or null with the first attempt's mismatched fields. */
interface Reproduction {
  state: EngineState | null;
  fields: string[];
}

/**
 * Searches the engine settings the result does not record for one that reproduces the stats. They are tried in
 * turn: stopOnError (letter and word only differ from off after an incorrect keystroke, so they are tried only
 * when the off run had one: `hadError`), and the last sample's second for non-time modes (candidateSkips). The
 * skipped sample only changes consistency, so its variant is tried only when the run with every sample misses on
 * consistency alone.
 */
function reproduce(input: VerifyInput, replay: Replay): Reproduction {
  let first: string[] | null = null;
  for (const stopOnError of STOP_ON_ERROR) {
    const config = configFor(input, stopOnError);
    const end = replay.events.length === 0 ? 0 : (replay.events[replay.events.length - 1]?.t ?? 0);
    let hadError = false;
    for (const skip of candidateSkips(config, end)) {
      const state = playReplay(config, replay, skip);
      hadError ||= state.keystrokes.some((k) => !k.correct);
      const fields = state.status === 'finished' && state.startedAt !== null
        ? statMismatches(input, computeResult(state))
        : ['end'];
      if (fields.length === 0) return { state, fields: [] };
      first ??= fields;
      // In a non-time mode a sample tick only adds a sample, and only consistency reads the samples (computeResult).
      // So a run that misses on anything else cannot be fixed by the skipped sample: its skip variant is not run.
      if (skip === null && fields.some((f) => f !== 'consistency')) break;
    }
    if (!hadError) break;
  }
  return { state: null, fields: first ?? ['end'] };
}

/** Checks the submitted stats against the replay (see reproduce). */
export function matchReplay(input: VerifyInput, replay: Replay): ReplayMatch {
  const found = reproduce(input, replay);
  return found.state ? { matched: true, fields: [] } : { matched: false, fields: found.fields };
}

/*
 * Timing plausibility. A person's keys are spread out and vary from one to the next. A script's are regular, or
 * come in bursts. None of these checks rejects a submission: an implausible replay is saved unverified, with no
 * replay stored (see verdictOf). The thresholds are deliberately loose, so a real typist is not caught by them.
 */

/** A gap between two keystrokes longer than this is a pause, not typing: it is left out of the intervals. */
export const TIMING_MAX_GAP_MS = 2000;
/** Fewer keystroke intervals than this are too few to judge how much they vary. */
export const TIMING_MIN_INTERVALS = 100;
/** Intervals whose coefficient of variation (stddev / mean) is below this are too regular for typing. */
export const TIMING_MIN_CV = 0.15;
/** Keystrokes closer together than this are a double fire, not two presses. */
export const TIMING_BURST_MS = 8;
/** Implausible when more than this share of the intervals are bursts. */
export const TIMING_BURST_SHARE = 0.2;
/** Implausible when the average events per second, first to last, is above this. */
export const TIMING_MAX_EVENTS_PER_SECOND = 40;
/** The events-per-second check needs at least this many events. */
export const TIMING_MIN_EVENTS_FOR_RATE = 50;
/** Implausible when the replayed consistency is at least this, on a test at least TIMING_CONSISTENCY_MIN_MS long. */
export const TIMING_CONSISTENCY_MIN = 99;
export const TIMING_CONSISTENCY_MIN_MS = 15_000;

/** The `verificationNote` of a result saved unverified because its timing is implausible. */
export const IMPLAUSIBLE_TIMING = 'implausible_timing';

/**
 * The gaps between consecutive keystrokes, in ms: every event, a character, a space, a backspace or a newline,
 * without the pauses over TIMING_MAX_GAP_MS. Spaces are keystrokes too: a bot that presses space at its own
 * cadence would otherwise show a rhythm of its own between the characters (a 36 ms bot's character gaps alternate
 * between 36 and 72 ms across a space).
 */
export function keyIntervals(events: Replay['events']): number[] {
  const out: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const gap = (events[i]?.t ?? 0) - (events[i - 1]?.t ?? 0);
    if (gap <= TIMING_MAX_GAP_MS) out.push(gap);
  }
  return out;
}

/** Coefficient of variation (population stddev over mean). 0 when the mean is 0, which is as regular as it gets. */
export function coefficientOfVariation(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (m <= 0) return 0;
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance) / m;
}

/**
 * The checks that need no engine run: the average rate, the burst share and the spread of the intervals.
 * True when the timing is implausible.
 */
export function implausibleRhythm(events: Replay['events']): boolean {
  const n = events.length;
  if (n >= TIMING_MIN_EVENTS_FOR_RATE) {
    const span = (events[n - 1]?.t ?? 0) - (events[0]?.t ?? 0);
    if (span <= 0 || ((n - 1) * 1000) / span > TIMING_MAX_EVENTS_PER_SECOND) return true;
  }
  const intervals = keyIntervals(events);
  if (intervals.length === 0) return false;
  const bursts = intervals.filter((g) => g < TIMING_BURST_MS).length;
  if (bursts > TIMING_BURST_SHARE * intervals.length) return true;
  return intervals.length >= TIMING_MIN_INTERVALS && coefficientOfVariation(intervals) < TIMING_MIN_CV;
}

/** The check on the replayed consistency and duration. True when the timing is implausible. */
export function implausibleConsistency(consistency: number, durationMs: number): boolean {
  return consistency >= TIMING_CONSISTENCY_MIN && durationMs >= TIMING_CONSISTENCY_MIN_MS;
}

export type ReplayVerdict =
  | { status: 'verified' }
  /** The replay does not reproduce the stats: the submission is rejected (400). */
  | { status: 'mismatch'; fields: string[] }
  /** The replay is fine but its timing is not human: the result is saved unverified, with no replay. */
  | { status: 'implausible_timing' };

/**
 * The verdict on a submitted result and its replay, checked in this order:
 * 1. the rhythm, which needs no engine run (so a bot's flood is rejected cheaply);
 * 2. the replay must reproduce the stats;
 * 3. the replayed consistency and duration.
 *
 * Known limitation: a copy of a real run with its timings slightly altered still passes. The duplicate check on
 * the replay hash, the timing checks and hiding event replays make that more costly; they do not rule it out.
 */
export function verdictOf(input: VerifyInput, replay: Replay): ReplayVerdict {
  if (implausibleRhythm(replay.events)) return { status: 'implausible_timing' };
  const found = reproduce(input, replay);
  if (!found.state) return { status: 'mismatch', fields: found.fields };
  const result = computeResult(found.state);
  if (implausibleConsistency(result.consistency, result.durationMs)) return { status: 'implausible_timing' };
  return { status: 'verified' };
}

/** True when two word lists are the same, in order. */
export function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

/** The words of today's daily challenge (or of `date`), as the frontend types them. */
export function dailyTextMatches(words: readonly string[], date: string, language: Language): boolean {
  return sameWords(words, dailyWords(date, language));
}

/** The words of an event text, split the way the frontend splits quotes. */
export function eventTextWords(text: string): string[] {
  return quoteToWords(text);
}
