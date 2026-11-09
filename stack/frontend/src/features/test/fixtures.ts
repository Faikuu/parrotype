import { createInitialState, engineReducer } from '@/lib/engine/engine';
import type { EngineState, TestConfig } from '@/lib/engine/types';

/** A custom-mode config with the given modifiers. Mode custom finishes when the last word is typed. */
export function customConfig(over: Partial<TestConfig> = {}): TestConfig {
  return {
    mode: 'custom', time: 30, words: 25, quoteLength: 'any', pangramCount: 1, punctuation: false, numbers: false,
    language: 'en', customText: '', stopOnError: 'off', noBackspace: false, suddenDeath: false, codeLanguage: 'js', ...over,
  };
}

/**
 * Runs keys through the engine reducer, the way the live test does. `keys` is a string of letters and
 * spaces; each character gets `at = start + index * step` ms, so timings are predictable.
 */
export function runTyping(
  words: string[],
  keys: string,
  options: { config?: Partial<TestConfig>; start?: number; step?: number } = {},
): EngineState {
  const { start = 1000, step = 200 } = options;
  let state = createInitialState(customConfig(options.config), words);
  let at = start;
  for (const ch of keys) {
    if (ch === ' ') state = engineReducer(state, { type: 'space', at });
    else state = engineReducer(state, { type: 'char', char: ch, at });
    at += step;
  }
  return state;
}
