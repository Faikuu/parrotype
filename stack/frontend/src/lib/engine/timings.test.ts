import { describe, it, expect } from 'vitest';
import { replayStateAt } from './replay';
import { slowestWords, wordTimings } from './timings';
import type { EngineEvent, EngineState, TestConfig } from './types';

const cfg: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false,
};

const c = (t: number, ch: string): EngineEvent => ({ t, k: 'c', ch });
const s = (t: number): EngineEvent => ({ t, k: 's' });

/** Builds the state a hand-written event log produces. */
function stateFrom(words: string[], events: EngineEvent[], config: TestConfig = cfg): EngineState {
  return replayStateAt(config, words, events, Infinity);
}

describe('wordTimings', () => {
  it('times each word from its first char to the space that left it', () => {
    // "hi" 0..300 (80 wpm), "yo" 400..1000 (40 wpm), "go" started at 1200 and still in progress at 1500.
    const state = stateFrom(['hi', 'yo', 'go', 'up'], [
      c(0, 'h'), c(100, 'i'), s(300),
      c(400, 'y'), c(700, 'o'), s(1000),
      c(1200, 'g'), c(1500, 'o'),
    ]);
    expect(state.status).toBe('running');
    const timings = wordTimings(state);
    expect(timings.map((w) => [w.index, w.word, w.ms, w.correct])).toEqual([
      [0, 'hi', 300, true],
      [1, 'yo', 600, true],
      [2, 'go', 300, true],
    ]);
    expect(timings[0]?.wpm).toBeCloseTo(80);
    expect(timings[1]?.wpm).toBeCloseTo(40);
    expect(timings[2]?.wpm).toBeCloseTo(80);
  });

  it('ends the last word at the finish, and marks wrong words as incorrect', () => {
    // "cat" typed as "cxt" is wrong. The test then finishes on the last char of "dog" (words mode).
    const state = stateFrom(['cat', 'dog'], [
      c(0, 'c'), c(200, 'x'), c(400, 't'), s(600),
      c(800, 'd'), c(900, 'o'), c(1000, 'g'),
    ]);
    expect(state.status).toBe('finished');
    expect(state.finishedAt).toBe(1000);
    const timings = wordTimings(state);
    expect(timings[0]).toMatchObject({ word: 'cat', ms: 600, correct: false });
    expect(timings[1]).toMatchObject({ word: 'dog', ms: 200, correct: true });
  });

  it('returns nothing before any keystroke', () => {
    expect(wordTimings(stateFrom(['cat'], []))).toEqual([]);
  });
});

describe('slowestWords', () => {
  it('lists completed correct words of 2+ chars, slowest first', () => {
    const state = stateFrom(['hi', 'yo', 'go', 'up'], [
      c(0, 'h'), c(100, 'i'), s(300),
      c(400, 'y'), c(700, 'o'), s(1000),
      c(1200, 'g'), c(1500, 'o'),
    ]);
    // "go" is in progress, so it is left out. Slowest first: "yo" (40 wpm), then "hi" (80 wpm).
    expect(slowestWords(state).map((w) => w.word)).toEqual(['yo', 'hi']);
  });

  it('leaves out wrong words and words of one char', () => {
    const state = stateFrom(['a', 'cat', 'dog'], [
      c(0, 'a'), s(100),
      c(200, 'c'), c(300, 'x'), c(400, 't'), s(500),
      c(600, 'd'), c(700, 'o'), c(800, 'g'),
    ]);
    expect(state.status).toBe('finished');
    expect(slowestWords(state).map((w) => w.word)).toEqual(['dog']);
  });

  it('respects n, and ties keep their order', () => {
    // ab: 200 ms, cd: 200 ms (tie, so ab first), ef: finished on its last char in 100 ms.
    const state = stateFrom(['ab', 'cd', 'ef'], [
      c(0, 'a'), c(100, 'b'), s(200),
      c(300, 'c'), c(400, 'd'), s(500),
      c(600, 'e'), c(700, 'f'),
    ]);
    expect(state.status).toBe('finished');
    expect(slowestWords(state, 10).map((w) => w.word)).toEqual(['ab', 'cd', 'ef']);
    expect(slowestWords(state, 2).map((w) => w.word)).toEqual(['ab', 'cd']);
    expect(slowestWords(state, 0)).toEqual([]);
  });
});
