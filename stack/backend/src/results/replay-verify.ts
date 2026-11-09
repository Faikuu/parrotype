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

/**
 * Checks the submitted stats against the replay. The engine settings the result does not record are tried
 * in turn: stopOnError (letter and word only differ from off after an incorrect keystroke, so they are skipped
 * when there was none), and the last sample's second for non-time modes (see candidateSkips).
 */
export function matchReplay(input: VerifyInput, replay: Replay): ReplayMatch {
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
      if (fields.length === 0) return { matched: true, fields: [] };
      first ??= fields;
    }
    if (!hadError) break;
  }
  return { matched: false, fields: first ?? ['end'] };
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
