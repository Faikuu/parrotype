import { createInitialState, engineReducer } from '@/lib/engine/engine';
import { eventAction } from '@/lib/engine/replay';
import type { EngineEvent, EngineState, TestConfig } from '@/lib/engine/types';

/** The length of a replay in ms: finish minus start, or the last logged event when the test has no finish time. */
export function replayLength(final: EngineState, events: readonly EngineEvent[]): number {
  if (final.startedAt !== null && final.finishedAt !== null) return Math.max(0, final.finishedAt - final.startedAt);
  return events.length === 0 ? 0 : (events[events.length - 1]?.t ?? 0);
}

/** How many events have `t <= ms`. The log is in time order, so this is a binary search. */
export function eventCountAt(events: readonly EngineEvent[], ms: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid]?.t ?? Infinity) <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface ReplayCursor {
  /** The state after the first `count` events. Same result as replayStateAt, but moving forward only applies the new events. */
  at(count: number): EngineState;
}

/**
 * A cursor over one replay. Playback moves forward a few events per frame, so the reducer runs only for
 * the new events. Going back starts again from the beginning. Returns the same object while `count`
 * does not change, which lets memoised views skip re-rendering.
 */
export function createReplayCursor(
  config: TestConfig,
  words: readonly string[],
  events: readonly EngineEvent[],
): ReplayCursor {
  let applied = 0;
  let state = createInitialState(config, [...words]);
  return {
    at(count) {
      const n = Math.max(0, Math.min(count, events.length));
      if (n < applied) {
        applied = 0;
        state = createInitialState(config, [...words]);
      }
      while (applied < n) {
        state = engineReducer(state, eventAction(events[applied]!));
        applied++;
      }
      return state;
    },
  };
}
