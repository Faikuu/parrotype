import { createInitialState, engineReducer } from './engine';
import type { EngineAction, EngineEvent, EngineState, TestConfig } from './types';

/**
 * Replays start at this base, so an event's `t` is also its `at`. Times in a replayed state are relative
 * to the start (keystroke `at` values are ms since the first char).
 */
const REPLAY_BASE = 0;

/** The reducer action for a logged event. */
export function eventAction(e: EngineEvent): EngineAction {
  const at = REPLAY_BASE + e.t;
  switch (e.k) {
    case 'c':
      return { type: 'char', char: e.ch ?? '', at };
    case 's':
      return { type: 'space', at };
    case 'b':
      return { type: 'backspace', at };
    case 'B':
      return { type: 'backspace', at, word: true };
    case 'n':
      return { type: 'newline', at };
  }
}

/**
 * The state after the events with `e.t <= t` have been applied to a fresh state. `words` is the target
 * text (zen ignores it). For time mode pass the final word list, since appended words are not logged.
 * Replaying every event gives the same typed, current, words and status as the live state; a time-mode
 * test ended by the timer is the one exception, because the timer is not logged.
 */
export function replayStateAt(
  config: TestConfig,
  words: readonly string[],
  events: readonly EngineEvent[],
  t: number,
): EngineState {
  let state = createInitialState(config, [...words]);
  for (const e of events) {
    if (e.t > t) continue;
    state = engineReducer(state, eventAction(e));
  }
  return state;
}

/** Length of a replay: the time of the last logged event (0 when there are none). */
export function replayDuration(events: readonly EngineEvent[]): number {
  return events.length === 0 ? 0 : (events[events.length - 1]?.t ?? 0);
}
