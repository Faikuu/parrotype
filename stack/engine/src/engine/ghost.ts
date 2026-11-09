import type { CodeLines, EngineEvent, TestConfig } from './types';
import { replayStateAt } from './replay';

/**
 * Where a ghost's caret is `elapsedMs` into a previous run: the state of its replay at that time (events
 * after the elapsed time are not applied). Once the run is over the caret stays at its end. `code` is the
 * line structure for code mode. Returns the word index and the char index in that word's typed text.
 */
export function ghostPosition(
  config: TestConfig,
  words: readonly string[],
  events: readonly EngineEvent[],
  elapsedMs: number,
  code?: CodeLines,
): { word: number; char: number } {
  const replayed = replayStateAt(config, words, events, elapsedMs, code ? { code } : undefined);
  const word = replayed.current;
  return { word, char: replayed.typed[word]?.length ?? 0 };
}
