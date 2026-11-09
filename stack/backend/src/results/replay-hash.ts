import { createHash } from 'node:crypto';
import type { Replay } from './results.schemas';

/**
 * sha256 (hex) of the canonical form of a replay: its target words, its events and its code layout, with the
 * keys in a fixed order. Two replays with the same typing have the same hash whatever the order of their keys,
 * so a copy of a stored replay is recognised. ResultReplay.hash is unique, so each replay is stored once.
 */
export function replayHash(replay: Replay): string {
  const canonical = JSON.stringify({
    words: replay.words,
    events: replay.events.map((e) => (e.ch === undefined ? { t: e.t, k: e.k } : { t: e.t, k: e.k, ch: e.ch })),
    code: replay.code ? { breaks: replay.code.breaks, indent: replay.code.indent } : null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
