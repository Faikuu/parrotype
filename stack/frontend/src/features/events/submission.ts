import { computeResult } from '@/lib/engine/stats';
import type { EngineState, TestConfig } from '@/lib/engine/types';
import type { Language, ResultInput } from '@/lib/api/types';

/**
 * The engine config of an event run. An event is a fixed text typed to its last word, the same as a custom text.
 * The server replays the run with the same rules (src/results/replay-verify.ts: configFor maps 'event' to 'custom').
 * Finishes need every word right (see EventTypingArea), and backspace stays on, so a wrong word can be fixed.
 */
export function eventConfig(base: TestConfig, text: string, language: Language): TestConfig {
  return {
    ...base,
    mode: 'custom',
    customText: text,
    language,
    punctuation: false,
    numbers: false,
    noBackspace: false,
    suddenDeath: false,
  };
}

/** Every word typed exactly, so an event run can be finished. */
export function allWordsCorrect(state: EngineState): boolean {
  return state.words.every((word, i) => state.typed[i] === word);
}

/** The result a finished event run is saved as: mode 'event', the slug as mode2, and the replay the server checks. */
export function eventResultInput(state: EngineState, slug: string, language: Language): ResultInput {
  const result = computeResult(state);
  return {
    mode: 'event',
    mode2: slug,
    language,
    wpm: result.wpm,
    rawWpm: result.rawWpm,
    accuracy: result.accuracy,
    consistency: result.consistency,
    durationMs: Math.round(result.durationMs),
    charStats: result.charStats,
    punctuation: false,
    numbers: false,
    replay: { v: 1, words: [...state.words], events: state.events },
  };
}
