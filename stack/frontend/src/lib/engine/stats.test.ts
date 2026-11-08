import { describe, it, expect } from 'vitest';
import { createInitialState, engineReducer } from './engine';
import { computeResult, consistencyOf, countChars } from './stats';
import type { EngineState, SecondSample, TestConfig } from './types';

const cfg: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
};

function typeAt(state: EngineState, events: [string, number][]): EngineState {
  return events.reduce<EngineState>((s, [ch, at]) => {
    if (ch === ' ') return engineReducer(s, { type: 'space', at });
    if (ch === 'FINISH') return engineReducer(s, { type: 'finish', at });
    return engineReducer(s, { type: 'char', char: ch, at });
  }, state);
}

describe('computeResult', () => {
  it('perfect words run: 10 chars in 2s is 66 wpm', () => {
    const s = typeAt(createInitialState(cfg, ['hello', 'world']), [
      ['h', 0], ['e', 200], ['l', 400], ['l', 600], ['o', 800],
      [' ', 1000],
      ['w', 1200], ['o', 1400], ['r', 1600], ['l', 1800], ['d', 2000],
    ]);
    const r = computeResult(s);
    expect(r.durationMs).toBe(2000);
    expect(r.wpm).toBe(66);
    expect(r.rawWpm).toBe(66);
    expect(r.accuracy).toBe(100);
    expect(r.consistency).toBe(100);
    expect(r.charStats).toEqual({ correct: 10, incorrect: 0, extra: 0, missed: 0 });
  });

  it('one wrong char: accuracy 2/3, wpm 0 for a wrong word, raw still counts typed chars', () => {
    const s = typeAt(createInitialState(cfg, ['cat']), [
      ['c', 0], ['x', 1000], ['t', 2000], [' ', 3000],
    ]);
    const r = computeResult(s);
    expect(r.durationMs).toBe(3000);
    expect(r.accuracy).toBe(66.67);
    expect(r.wpm).toBe(0);
    expect(r.rawWpm).toBe(12);
    expect(r.charStats).toEqual({ correct: 2, incorrect: 1, extra: 0, missed: 0 });
  });

  it('partially typed last word counts when it is a correct prefix', () => {
    const s = typeAt(createInitialState(cfg, ['hello', 'world']), [
      ['h', 0], ['e', 1000], ['l', 2000], ['l', 3000], ['o', 4000], [' ', 4500],
      ['w', 5000], ['o', 6000], ['r', 7000], ['FINISH', 10000],
    ]);
    const r = computeResult(s);
    expect(r.durationMs).toBe(10000);
    expect(r.wpm).toBe(10.8);
    expect(r.rawWpm).toBe(10.8);
  });

  it('counts missed chars when a word is left early', () => {
    const s = typeAt(createInitialState(cfg, ['hello', 'world']), [
      ['h', 0], ['e', 100], [' ', 200],
    ]);
    expect(countChars(s)).toEqual({ correct: 2, incorrect: 0, extra: 0, missed: 3 });
  });

  it('accuracy is 100 with no keystrokes', () => {
    const r = computeResult(createInitialState(cfg, ['a']));
    expect(r.accuracy).toBe(100);
    expect(r.wpm).toBe(0);
    expect(r.durationMs).toBe(0);
  });

  it('uses the time limit for time-mode duration', () => {
    let s = createInitialState({ ...cfg, mode: 'time', time: 15 }, ['a', 'b']);
    s = engineReducer(s, { type: 'char', char: 'a', at: 0 });
    s = engineReducer(s, { type: 'tick', at: 20000 });
    expect(computeResult(s).durationMs).toBe(15000);
  });
});

describe('consistency', () => {
  it('is 100 with fewer than 2 samples', () => {
    expect(consistencyOf([])).toBe(100);
    expect(consistencyOf([{ second: 1, wpm: 1, raw: 50, errors: 0 }])).toBe(100);
  });

  it('is 100 when all samples are equal', () => {
    const same: SecondSample[] = [1, 2, 3].map((second) => ({ second, wpm: 60, raw: 60, errors: 0 }));
    expect(consistencyOf(same)).toBe(100);
  });

  it('is 100 * (1 - cv): raw 30 and 90 give cv 0.5 and consistency 50', () => {
    const s: SecondSample[] = [
      { second: 1, wpm: 0, raw: 30, errors: 0 },
      { second: 2, wpm: 0, raw: 90, errors: 0 },
    ];
    expect(consistencyOf(s)).toBe(50);
  });

  it('is clamped to 0 and rounded in the result', () => {
    const s: SecondSample[] = [
      { second: 1, wpm: 0, raw: 0, errors: 0 },
      { second: 2, wpm: 0, raw: 300, errors: 0 },
    ];
    expect(consistencyOf(s)).toBeGreaterThanOrEqual(0);
    expect(consistencyOf(s)).toBeLessThanOrEqual(100);
    const withSamples = { ...createInitialState(cfg, ['a']), samples: s };
    expect(computeResult(withSamples).consistency).toBe(0);
  });
});
