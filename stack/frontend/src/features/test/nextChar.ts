import type { EngineState } from '@/lib/engine/types';

/**
 * The character the user types next: the next letter of the current word, the space after a finished word, or
 * null when there is none (zen has no target, a finished test has nothing next, and the last word has no space).
 */
export function nextCharOf(state: EngineState): string | null {
  if (state.config.mode === 'zen' || state.status === 'finished') return null;
  const word = state.words[state.current];
  if (word === undefined) return null;
  const typed = state.typed[state.current] ?? '';
  if (typed.length < word.length) return word.charAt(typed.length);
  return state.current < state.words.length - 1 ? ' ' : null;
}
