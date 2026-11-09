import {
  computeResult,
  createInitialState,
  createRng,
  engineReducer,
  type EngineAction,
  type EngineExtras,
  type EngineState,
  type TestConfig,
} from '@parrotype/engine';
import type { Replay } from '../src/results/results.schemas';

/**
 * Typing fixtures shared by the unit and e2e tests. liveRun plays keystrokes the way the frontend does (a
 * tick every 100 ms, from a phase, until the test finishes), so the stats and samples of a run match what the
 * frontend would submit. runBody builds the submitted result, replay included, from the finished run.
 */

/** One keystroke of a live run: `at` is the wall-clock time in ms. */
export interface Key {
  at: number;
  kind: 'c' | 's' | 'b' | 'B' | 'n';
  ch?: string;
}

export const base: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false, codeLanguage: 'js',
};

export const POOL = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'pack', 'my', 'box', 'with', 'five', 'dozen', 'liquor', 'jugs'];

function toAction(k: Key): EngineAction {
  switch (k.kind) {
    case 'c': return { type: 'char', char: k.ch ?? '', at: k.at };
    case 's': return { type: 'space', at: k.at };
    case 'b': return { type: 'backspace', at: k.at };
    case 'B': return { type: 'backspace', at: k.at, word: true };
    case 'n': return { type: 'newline', at: k.at };
  }
}

/**
 * A run the way the frontend plays it: a tick every `tickMs` (at `phase` ms past the second), each keystroke at its
 * time, and ticks until the test finishes. The phase only moves the ticks; the result must not depend on it.
 */
export function liveRun(config: TestConfig, words: string[], extras: EngineExtras, keys: Key[], tickMs = 100, phase = 0): EngineState {
  let state = createInitialState(config, words, extras);
  let tickAt = phase === 0 ? tickMs : phase;
  const tickUntil = (until: number): void => {
    while (tickAt <= until && state.status !== 'finished') {
      state = engineReducer(state, { type: 'tick', at: tickAt });
      tickAt += tickMs;
    }
  };
  for (const key of keys) {
    if (state.status === 'finished') break;
    tickUntil(key.at);
    state = engineReducer(state, toAction(key));
  }
  // Time mode ends on the timer, after the last keystroke.
  if (config.mode === 'time') tickUntil(Number.MAX_SAFE_INTEGER);
  return state;
}

/** The replay a client sends for a finished run (the same fields the frontend logs). */
export function replayOf(state: EngineState, extras: EngineExtras = {}): Replay {
  return {
    v: 1,
    words: [...state.words],
    events: state.events.map((e) => ({ ...e })),
    ...(extras.code ? { code: extras.code } : {}),
  };
}

/** Types `targets` one after another, with a wrong letter and a backspace now and then. */
export function typeWords(
  targets: string[],
  seed: number,
  opts: { mistakeRate?: number; startAt?: number; backspace?: boolean } = {},
): Key[] {
  const rng = createRng(seed);
  const keys: Key[] = [];
  let at = opts.startAt ?? 0;
  const gap = (): number => 120 + Math.floor(rng() * 260);
  targets.forEach((word, i) => {
    for (let c = 0; c < word.length; c++) {
      if (rng() < (opts.mistakeRate ?? 0)) {
        keys.push({ at, kind: 'c', ch: 'z' });
        at += gap();
        // With stopOnError=letter the wrong letter is not inserted, so there is nothing to delete.
        if (opts.backspace !== false) {
          keys.push({ at, kind: 'b' });
          at += gap();
        }
      }
      keys.push({ at, kind: 'c', ch: word.charAt(c) });
      at += gap();
    }
    if (i < targets.length - 1) {
      keys.push({ at, kind: 's' });
      at += gap();
    }
  });
  return keys;
}


/** The result fields the frontend submits for a finished run, for the given mode and mode2. */
export function resultFields(config: TestConfig, state: EngineState, mode: string, mode2: string) {
  const r = computeResult(state);
  return {
    mode,
    mode2,
    language: config.language,
    punctuation: config.punctuation,
    numbers: config.numbers,
    wpm: r.wpm,
    rawWpm: r.rawWpm,
    accuracy: r.accuracy,
    consistency: r.consistency,
    durationMs: Math.round(r.durationMs),
    charStats: r.charStats,
  };
}
