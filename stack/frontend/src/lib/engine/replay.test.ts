import { describe, it, expect } from 'vitest';
import { createInitialState, engineReducer } from './engine';
import { replayDuration, replayStateAt } from './replay';
import { createRng } from '../text/rng';
import type { EngineAction, EngineExtras, EngineState, TestConfig } from './types';

const base: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false, codeLanguage: 'js',
};

const WORD_POOL = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'pack', 'my', 'box', 'with'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * One random input action: mostly the next target char, plus wrong chars, spaces, backspaces, newlines.
 * At a code line end (`code.breaks`) Enter and space are both likely, since only Enter separates there.
 */
function nextAction(state: EngineState, rng: () => number, at: number, code?: EngineExtras['code']): EngineAction {
  const target = state.config.mode === 'zen' ? '' : (state.words[state.current] ?? '');
  const typed = state.typed[state.current] ?? '';
  const expected = target.charAt(typed.length);
  const r = rng();
  const randomLetter = LETTERS.charAt(Math.floor(rng() * LETTERS.length));
  if (code?.breaks[state.current] === true && r < 0.4) {
    return r < 0.3 ? { type: 'newline', at } : { type: 'space', at };
  }
  if (r < 0.55 && expected !== '') return { type: 'char', char: expected, at };
  if (r < 0.65) return { type: 'char', char: randomLetter, at };
  if (r < 0.75) return { type: 'space', at };
  if (r < 0.85) return { type: 'backspace', at };
  if (r < 0.89) return { type: 'backspace', at, word: true };
  if (r < 0.9) return { type: 'newline', at };
  return { type: 'char', char: randomLetter, at };
}

/**
 * Runs ~`count` random actions, keeping a snapshot after each one (with its absolute time). Code configs get
 * random line breaks (about one word in four ends a line) and the fuzzer sends Enter and space there.
 */
function fuzz(config: TestConfig, seed: number, count = 300) {
  const rng = createRng(seed);
  const words = Array.from({ length: 60 }, () => WORD_POOL[Math.floor(rng() * WORD_POOL.length)] ?? 'the');
  const extras: EngineExtras = {};
  if (config.mode === 'code') {
    const breaks = words.map((_, i) => i < words.length - 1 && rng() < 0.25);
    extras.code = { breaks, indent: words.map(() => 0) };
  }
  let state = createInitialState(config, words, extras);
  const snaps: { at: number; state: EngineState }[] = [];
  let at = 1000;
  for (let i = 0; i < count && state.status !== 'finished'; i++) {
    at += Math.floor(rng() * 400);
    state = engineReducer(state, nextAction(state, rng, at, extras.code));
    snaps.push({ at, state });
  }
  return { words, extras, state, snaps };
}

const configs: [string, Partial<TestConfig>][] = [
  ['default words', {}],
  ['stop on letter', { stopOnError: 'letter' }],
  ['stop on word', { stopOnError: 'word' }],
  ['no backspace', { noBackspace: true }],
  ['no backspace, stop on word', { noBackspace: true, stopOnError: 'word' }],
  ['time mode', { mode: 'time', time: 60 }],
  ['zen', { mode: 'zen' }],
  ['sudden death', { suddenDeath: true }],
  ['sudden death, letter', { suddenDeath: true, stopOnError: 'letter' }],
  ['code', { mode: 'code', codeLanguage: 'py' }],
  ['code, stop on word', { mode: 'code', codeLanguage: 'go', stopOnError: 'word' }],
  ['code, sudden death', { mode: 'code', codeLanguage: 'rs', suddenDeath: true }],
];

describe('replay of random input', () => {
  for (const [name, over] of configs) {
    it(`replay at the end equals the live state (${name})`, () => {
      const config = { ...base, ...over };
      for (let seed = 1; seed <= 4; seed++) {
        const { words, extras, state } = fuzz(config, seed);
        const replayed = replayStateAt(config, words, state.events, Infinity, extras);
        expect(replayed.typed).toEqual(state.typed);
        expect(replayed.current).toBe(state.current);
        expect(replayed.words).toEqual(state.words);
        expect(replayed.status).toBe(state.status);
        expect(replayed.failed).toBe(state.failed);
        expect(replayed.events).toEqual(state.events);
        expect(replayed.code).toEqual(state.code);
      }
    });
  }

  it('the code fuzz sends newlines at line ends and some of them are logged', () => {
    const config = { ...base, mode: 'code' as const, codeLanguage: 'js' as const };
    const newlines = [1, 2, 3, 4].map((seed) => fuzz(config, seed).state.events.filter((e) => e.k === 'n').length);
    expect(newlines.every((n) => n > 0)).toBe(true);
  });

  it('the fuzz actually produces events and finishes sometimes', () => {
    const { state } = fuzz(base, 7);
    expect(state.events.length).toBeGreaterThan(100);
    const finished = configs.some(([, over]) => fuzz({ ...base, ...over }, 3).state.status === 'finished');
    expect(finished).toBe(true);
    const failed = [1, 2, 3, 4].some((seed) => fuzz({ ...base, suddenDeath: true }, seed).state.failed);
    expect(failed).toBe(true);
  });

  it('partial replays match the live state at the same time', () => {
    for (const [, over] of configs) {
      const config = { ...base, ...over };
      for (let seed = 1; seed <= 2; seed++) {
        const { words, extras, state, snaps } = fuzz(config, seed);
        const start = state.startedAt ?? 0;
        const last = snaps[snaps.length - 1]?.at ?? start;
        const rng = createRng(seed * 31);
        for (let k = 0; k < 12; k++) {
          const cutoff = start + Math.floor(rng() * (last - start + 1));
          // Expected: the live state after the last action at or before the cutoff.
          let expected = createInitialState(config, words, extras);
          for (const snap of snaps) if (snap.at <= cutoff) expected = snap.state;
          const replayed = replayStateAt(config, words, state.events, cutoff - start, extras);
          expect(replayed.typed).toEqual(expected.typed);
          expect(replayed.current).toBe(expected.current);
          expect(replayed.status).toBe(expected.status);
          expect(replayed.events).toEqual(expected.events);
        }
      }
    }
  });
});

describe('replayStateAt and replayDuration', () => {
  it('no events replays to the initial state', () => {
    const s = replayStateAt(base, ['cat'], [], Infinity);
    expect(s.status).toBe('idle');
    expect(s.typed).toEqual(['']);
  });

  it('applies only events with t <= the given time', () => {
    const events = [
      { t: 0, k: 'c' as const, ch: 'c' },
      { t: 100, k: 'c' as const, ch: 'a' },
      { t: 200, k: 'c' as const, ch: 'x' },
    ];
    expect(replayStateAt(base, ['cat'], events, 99).typed[0]).toBe('c');
    expect(replayStateAt(base, ['cat'], events, 100).typed[0]).toBe('ca');
    expect(replayStateAt(base, ['cat'], events, 199).typed[0]).toBe('ca');
    expect(replayStateAt(base, ['cat'], events, 200).typed[0]).toBe('cax');
  });

  it('replayDuration is the time of the last event', () => {
    expect(replayDuration([])).toBe(0);
    expect(replayDuration([{ t: 0, k: 's' }, { t: 1234, k: 'b' }])).toBe(1234);
  });
});
