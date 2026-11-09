import type { EngineState } from '@/lib/engine/types';
import type { RacePlayer } from './protocol';

/** Length of the common prefix of `typed` and `target`. */
function correctPrefix(typed: string, target: string): number {
  let n = 0;
  while (n < typed.length && n < target.length && typed.charAt(n) === target.charAt(n)) n++;
  return n;
}

/**
 * The progress the server expects: the chars of every correctly typed word before the caret, each
 * with the space that followed it, plus the correct prefix of the word under the caret. With single
 * spaces between words and every word right, this reaches text.length on the last word.
 */
export function correctCharsOf(state: EngineState): number {
  let chars = 0;
  for (let i = 0; i < state.typed.length; i++) {
    const target = state.words[i] ?? '';
    const typed = state.typed[i] ?? '';
    if (i < state.current) {
      if (typed === target) chars += target.length + 1;
    } else if (i === state.current) {
      chars += correctPrefix(typed, target);
    }
  }
  return chars;
}

/** Every word typed exactly, so the race can be finished. */
export function allWordsCorrect(state: EngineState): boolean {
  return state.words.every((word, i) => state.typed[i] === word);
}

/**
 * Standings for the results table: finishers by place, then players who ran out of time by how far
 * they got. Disconnected players stay in the list.
 */
export function placements(players: readonly RacePlayer[]): RacePlayer[] {
  return [...players].sort((a, b) => {
    if (a.place !== null && b.place !== null) return a.place - b.place;
    if (a.place !== null) return -1;
    if (b.place !== null) return 1;
    if (a.progress !== b.progress) return b.progress - a.progress;
    return a.name.localeCompare(b.name);
  });
}
