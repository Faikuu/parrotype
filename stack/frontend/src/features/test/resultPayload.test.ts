import { buildReplay, mode2Of, REPLAY_LIMITS, toResultInput } from './resultPayload';
import { customConfig } from './fixtures';
import { createInitialState, engineReducer } from '@/lib/engine/engine';
import { eventAction } from '@/lib/engine/replay';
import { computeResult } from '@/lib/engine/stats';
import type { EngineState } from '@/lib/engine/types';

/** A small finished custom test: 'ok' typed with a space between two words, at fixed times. */
function finishedState(): EngineState {
  let s = createInitialState(customConfig({ mode: 'custom' }), ['ok', 'go']);
  const keys: Array<[number, 'c' | 's', string?]> = [
    [0, 'c', 'o'],
    [120, 'c', 'k'],
    [300, 's'],
    [450, 'c', 'g'],
    [600, 'c', 'o'],
  ];
  for (const [at, k, ch] of keys) {
    const action = k === 'c' ? ({ type: 'char', char: ch ?? '', at: 1000 + at } as const) : ({ type: 'space', at: 1000 + at } as const);
    s = engineReducer(s, action);
  }
  return s;
}

describe('buildReplay', () => {
  it('logs the target words, the events in order and no code lines outside code mode', () => {
    const state = finishedState();
    const replay = buildReplay(state);
    expect(replay).not.toBeNull();
    expect(replay!.v).toBe(1);
    expect(replay!.words).toEqual(['ok', 'go']);
    expect(replay!.events.map((e) => e.k)).toEqual(['c', 'c', 's', 'c', 'c']);
    expect(replay!.events[0]).toEqual({ t: 0, k: 'c', ch: 'o' });
    expect(replay!.events[2]).toEqual({ t: 300, k: 's' });
    expect(replay!.code).toBeUndefined();
  });

  it('copies the code lines of a code test', () => {
    const base = finishedState();
    const state: EngineState = {
      ...base,
      config: { ...base.config, mode: 'code', codeLanguage: 'js' },
      code: { breaks: [false, true], indent: [0, 2] },
    };
    expect(buildReplay(state)!.code).toEqual({ breaks: [false, true], indent: [0, 2] });
  });

  it('is null (saved unverified) when the test is past the server caps', () => {
    const state = finishedState();
    const tooManyWords = { ...state, words: Array.from({ length: REPLAY_LIMITS.words + 1 }, () => 'a') };
    expect(buildReplay(tooManyWords)).toBeNull();
    const longWord = { ...state, words: ['x'.repeat(REPLAY_LIMITS.wordLength + 1)] };
    expect(buildReplay(longWord)).toBeNull();
    expect(buildReplay({ ...state, events: [] })).toBeNull();
  });

  it('keeps the words of a time test, including the ones appended while typing (they are not in the log)', () => {
    const base = createInitialState(customConfig({ mode: 'time', time: 15 }), ['ok']);
    let s = engineReducer(base, { type: 'char', char: 'o', at: 5000 });
    s = engineReducer(s, { type: 'append', words: ['more', 'words'] });
    s = engineReducer(s, { type: 'char', char: 'k', at: 5100 });
    expect(buildReplay(s)!.words).toEqual(['ok', 'more', 'words']);
  });
});

describe('toResultInput', () => {
  it('sends the mode2 and flags of the test, and the replay when there is one', () => {
    const state = finishedState();
    const result = { ...computeResult(state), failed: false, keyStats: {} };
    const cfg = customConfig({ mode: 'custom', punctuation: true, numbers: true, language: 'de' });
    const input = toResultInput(cfg, result, '2026-11-09', buildReplay(state));
    expect(input).toMatchObject({ mode: 'custom', mode2: 'custom', language: 'de', punctuation: true, numbers: true });
    expect(input.replay?.words).toEqual(['ok', 'go']);

    const without = toResultInput(cfg, result, '2026-11-09', null);
    expect(without).not.toHaveProperty('replay');
  });

  it('sends code results as English and daily results without numbers', () => {
    const state = finishedState();
    const result = { ...computeResult(state), failed: false, keyStats: {} };
    const code = toResultInput(customConfig({ mode: 'code', codeLanguage: 'go', language: 'pl', numbers: true }), result, '', null);
    expect(code).toMatchObject({ mode: 'code', mode2: 'go', language: 'en' });
    const daily = toResultInput(customConfig({ mode: 'daily', numbers: true, punctuation: false }), result, '2026-11-09', null);
    expect(daily).toMatchObject({ mode2: '2026-11-09', punctuation: true, numbers: false });
  });

  it('gives the mode2 of each mode the server expects', () => {
    expect(mode2Of(customConfig({ mode: 'time', time: 30 }), '')).toBe('30');
    expect(mode2Of(customConfig({ mode: 'words', words: 50 }), '')).toBe('50');
    expect(mode2Of(customConfig({ mode: 'quote', quoteLength: 'long' }), '')).toBe('long');
    expect(mode2Of(customConfig({ mode: 'pangram', pangramCount: 3 }), '')).toBe('3');
  });
});

// The events of a finished test are the reducer's own log: a replay of the log gives the same typed text.
describe('the replay log', () => {
  it('replays to the same typed text as the live state', () => {
    const state = finishedState();
    let replayed = createInitialState(state.config, state.words);
    for (const e of state.events) replayed = engineReducer(replayed, eventAction(e));
    expect(replayed.typed).toEqual(state.typed);
  });
});
