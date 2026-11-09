import { describe, expect, it } from 'vitest';
import { createInitialState, engineReducer } from '@/lib/engine/engine';
import { replayStateAt } from '@/lib/engine/replay';
import type { EngineAction, EngineEvent, EngineState, TestConfig } from '@/lib/engine/types';
import { createReplayCursor, eventCountAt, replayLength } from './replayCursor';

const CONFIG: TestConfig = {
  mode: 'custom', time: 30, words: 25, quoteLength: 'any', pangramCount: 1, punctuation: false, numbers: false,
  language: 'en', customText: '', stopOnError: 'off', noBackspace: false, suddenDeath: false,
};
const WORDS = ['cat', 'dog'];

/** Runs actions through the reducer, the same way the live test does, and returns the final state. */
function run(actions: EngineAction[]): EngineState {
  let state = createInitialState(CONFIG, WORDS);
  for (const a of actions) state = engineReducer(state, a);
  return state;
}

const TYPED: EngineAction[] = [
  { type: 'char', char: 'c', at: 1000 },
  { type: 'char', char: 'a', at: 1100 },
  { type: 'char', char: 'x', at: 1250 },
  { type: 'backspace', at: 1300 },
  { type: 'char', char: 't', at: 1400 },
  { type: 'space', at: 1500 },
  { type: 'char', char: 'd', at: 1800 },
  { type: 'char', char: 'o', at: 1900 },
  { type: 'char', char: 'g', at: 2100 },
];

describe('eventCountAt', () => {
  const events: EngineEvent[] = [
    { t: 0, k: 'c', ch: 'a' },
    { t: 100, k: 'c', ch: 'b' },
    { t: 100, k: 'c', ch: 'c' },
    { t: 500, k: 's' },
  ];
  it('counts events at or before a time', () => {
    expect(eventCountAt(events, -1)).toBe(0);
    expect(eventCountAt(events, 0)).toBe(1);
    expect(eventCountAt(events, 99)).toBe(1);
    expect(eventCountAt(events, 100)).toBe(3);
    expect(eventCountAt(events, 10_000)).toBe(4);
    expect(eventCountAt([], 10)).toBe(0);
  });
});

describe('createReplayCursor', () => {
  it('gives the same state as replayStateAt for every prefix', () => {
    const final = run(TYPED);
    const events = final.events;
    const cursor = createReplayCursor(CONFIG, WORDS, events);
    for (let n = 0; n <= events.length; n++) {
      const t = n === 0 ? -1 : events[n - 1]!.t;
      const expected = replayStateAt(CONFIG, WORDS, events, t);
      expect(cursor.at(n)).toEqual(expected);
    }
  });

  it('ends on the typed text of the live state', () => {
    const final = run(TYPED);
    const cursor = createReplayCursor(CONFIG, WORDS, final.events);
    const end = cursor.at(final.events.length);
    expect(end.typed).toEqual(final.typed);
    expect(end.current).toEqual(final.current);
  });

  it('goes backwards by starting again, and returns the same object while the count is unchanged', () => {
    const final = run(TYPED);
    const cursor = createReplayCursor(CONFIG, WORDS, final.events);
    const forward = cursor.at(5);
    expect(cursor.at(5)).toBe(forward);
    const back = cursor.at(2);
    expect(back.events).toHaveLength(2);
    expect(back.typed[0]).toBe('ca');
  });

  it('clamps counts outside the log', () => {
    const cursor = createReplayCursor(CONFIG, WORDS, []);
    expect(cursor.at(10).events).toHaveLength(0);
    expect(cursor.at(-3).events).toHaveLength(0);
  });
});

describe('replayLength', () => {
  it('is finish minus start for a finished test', () => {
    const final = run([...TYPED, { type: 'finish', at: 5000 }]);
    expect(replayLength(final, final.events)).toBe(5000 - 1000);
  });

  it('falls back to the last event for an unfinished state', () => {
    const state = run(TYPED);
    expect(replayLength(state, state.events)).toBe(1100);
    expect(replayLength(createInitialState(CONFIG, WORDS), [])).toBe(0);
  });
});
