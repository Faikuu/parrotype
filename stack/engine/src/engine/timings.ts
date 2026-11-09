import { createInitialState, engineReducer, isWordCorrect } from './engine';
import { eventAction } from './replay';
import type { EngineState } from './types';

export interface WordTiming {
  index: number;
  word: string;
  /** From the first keystroke of the word to the space that left it (or the finish). */
  ms: number;
  wpm: number;
  correct: boolean;
}

interface Span extends WordTiming {
  /** Left with a space, or the test finished on it. Unfinished words are not done. */
  done: boolean;
}

/**
 * Timing for every word the user started, from the event log. A word starts at its first char event
 * and ends at the first event that moves the cursor past it, or at the finish. A word still in progress
 * ends at the last event. wpm uses the standard 5 chars per word.
 */
function spans(state: EngineState): Span[] {
  if (state.events.length === 0 || state.startedAt === null) return [];

  const starts = new Map<number, number>();
  const ends = new Map<number, number>();
  let replayed = createInitialState(state.config, state.words);
  for (const e of state.events) {
    const before = replayed.current;
    if (e.k === 'c' && !starts.has(before)) starts.set(before, e.t);
    replayed = engineReducer(replayed, eventAction(e));
    if (replayed.current > before && !ends.has(before)) ends.set(before, e.t);
  }

  const lastT = state.events[state.events.length - 1]?.t ?? 0;
  const finishT = state.finishedAt === null ? null : state.finishedAt - state.startedAt;

  const out: Span[] = [];
  for (const [index, start] of [...starts.entries()].sort((a, b) => a[0] - b[0])) {
    const word = state.words[index] ?? '';
    const left = ends.get(index);
    const end = left ?? finishT ?? lastT;
    const ms = Math.max(0, end - start);
    out.push({
      index,
      word,
      ms,
      wpm: ms > 0 ? (word.length / 5) / (ms / 60000) : 0,
      correct: isWordCorrect(state, index),
      done: left !== undefined || state.status === 'finished',
    });
  }
  return out;
}

function toTiming(span: Span): WordTiming {
  return { index: span.index, word: span.word, ms: span.ms, wpm: span.wpm, correct: span.correct };
}

/** Time and speed per word the user started. */
export function wordTimings(state: EngineState): WordTiming[] {
  return spans(state).map(toTiming);
}

/**
 * The `n` slowest completed, correct words of at least 2 chars, slowest first (ascending wpm).
 */
export function slowestWords(state: EngineState, n = 5): WordTiming[] {
  return spans(state)
    .filter((w) => w.done && w.correct && w.word.length >= 2 && w.ms > 0)
    .sort((a, b) => a.wpm - b.wpm)
    .slice(0, Math.max(0, n))
    .map(toTiming);
}
