import { describe, expect, it } from 'vitest';
import { createInitialState, engineReducer } from '@/lib/engine/engine';
import type { EngineState, TestConfig } from '@/lib/engine/types';
import { quoteToWords } from '@/lib/text/generator';
import { allWordsCorrect, correctCharsOf, placements } from './raceProgress';
import type { RacePlayer } from './protocol';

const config: TestConfig = {
  mode: 'quote',
  time: 30,
  words: 10,
  quoteLength: 'any',
  pangramCount: 1,
  punctuation: false,
  numbers: false,
  language: 'en',
  customText: '',
  stopOnError: 'off',
  noBackspace: false,
  suddenDeath: false, codeLanguage: 'js',
};

/** Types `typed` against the target quote `quote`. */
function typeInto(quote: string, typed: string): EngineState {
  let state = createInitialState(config, quoteToWords(quote));
  let t = 0;
  for (const ch of typed) {
    state = engineReducer(state, ch === ' ' ? { type: 'space', at: (t += 10) } : { type: 'char', char: ch, at: (t += 10) });
  }
  return state;
}

describe('correctCharsOf', () => {
  it('counts the correct words and their spaces, plus the correct prefix of the current word', () => {
    expect(correctCharsOf(typeInto('ab cd e', 'ab cd e'))).toBe(7);
    expect(correctCharsOf(typeInto('ab cd e', 'ab c'))).toBe(4);
    expect(correctCharsOf(typeInto('ab cd e', 'ab x'))).toBe(3);
    expect(correctCharsOf(typeInto('ab cd e', 'ax'))).toBe(1);
  });

  it('does not count a wrong word left behind, so the server total never runs ahead', () => {
    const state = typeInto('ab cd e', 'ax cd');
    expect(correctCharsOf(state)).toBe(2);
  });
});

describe('allWordsCorrect', () => {
  it('is true only when every word is typed exactly', () => {
    expect(allWordsCorrect(typeInto('ab cd e', 'ab cd e'))).toBe(true);
    expect(allWordsCorrect(typeInto('ab cd e', 'ax cd e'))).toBe(false);
    expect(allWordsCorrect(typeInto('ab cd e', 'ab cd'))).toBe(false);
  });
});

function player(id: string, over: Partial<RacePlayer>): RacePlayer {
  return {
    id,
    name: id,
    isGuest: false,
    progress: 0,
    wpm: 0,
    finished: false,
    place: null,
    accuracy: null,
    connected: true,
    ...over,
  };
}

describe('placements', () => {
  it('orders finishers by place, then the rest by progress', () => {
    const rows = placements([
      player('slow', { progress: 0.4 }),
      player('second', { place: 2 }),
      player('first', { place: 1 }),
      player('ahead', { progress: 0.9 }),
    ]);
    expect(rows.map((p) => p.id)).toEqual(['first', 'second', 'ahead', 'slow']);
  });
});
