import type { Replay } from './results.schemas';
import { replayHash } from './replay-hash';

const replay: Replay = {
  v: 1,
  words: ['the', 'fox'],
  events: [
    { t: 0, k: 'c', ch: 't' },
    { t: 120, k: 's' },
    { t: 240, k: 'c', ch: 'f' },
  ],
};

describe('replayHash', () => {
  it('is a sha256 hex digest', () => {
    expect(replayHash(replay)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is the same for the same typing, whatever the key order of its objects', () => {
    const reordered = {
      events: replay.events.map((e) => (e.ch === undefined ? { k: e.k, t: e.t } : { ch: e.ch, k: e.k, t: e.t })),
      words: [...replay.words],
      v: 1 as const,
    };
    expect(replayHash(reordered)).toBe(replayHash(replay));
  });

  it('changes with any keystroke, word, timing or the code layout', () => {
    const base = replayHash(replay);
    expect(replayHash({ ...replay, words: ['the', 'dog'] })).not.toBe(base);
    expect(replayHash({ ...replay, events: replay.events.map((e, i) => (i === 2 ? { ...e, t: 241 } : e)) })).not.toBe(base);
    expect(replayHash({ ...replay, events: replay.events.map((e, i) => (i === 2 ? { ...e, ch: 'g' } : e)) })).not.toBe(base);
    expect(replayHash({ ...replay, code: { breaks: [false, false], indent: [0, 0] } })).not.toBe(base);
  });
});
