import { describe, it, expect } from 'vitest';
import { ghostPosition } from './ghost';
import type { EngineEvent, TestConfig } from './types';

const base: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false, codeLanguage: 'js',
};

const c = (t: number, ch: string): EngineEvent => ({ t, k: 'c', ch });
const s = (t: number): EngineEvent => ({ t, k: 's' });

describe('ghostPosition', () => {
  it('is the start before any event', () => {
    expect(ghostPosition(base, ['abc'], [], 5000)).toEqual({ word: 0, char: 0 });
  });

  it('moves with the replay: a char appears at its time', () => {
    const events = [c(0, 'a'), c(100, 'b'), c(200, 'c')];
    expect(ghostPosition(base, ['abc', 'd'], events, 0)).toEqual({ word: 0, char: 1 });
    expect(ghostPosition(base, ['abc', 'd'], events, 99)).toEqual({ word: 0, char: 1 });
    expect(ghostPosition(base, ['abc', 'd'], events, 100)).toEqual({ word: 0, char: 2 });
    expect(ghostPosition(base, ['abc', 'd'], events, 200)).toEqual({ word: 0, char: 3 });
  });

  it('moves to the next word on a space', () => {
    const events = [c(0, 'a'), c(100, 'b'), s(200), c(300, 'c')];
    expect(ghostPosition(base, ['ab', 'cd'], events, 250)).toEqual({ word: 1, char: 0 });
    expect(ghostPosition(base, ['ab', 'cd'], events, 300)).toEqual({ word: 1, char: 1 });
  });

  it('stays at the end once the run is over, however late the elapsed time', () => {
    const events = [c(0, 'a'), c(100, 'b'), s(200), c(300, 'c'), c(400, 'd')];
    const end = { word: 1, char: 2 };
    expect(ghostPosition(base, ['ab', 'cd'], events, 400)).toEqual(end);
    expect(ghostPosition(base, ['ab', 'cd'], events, 60_000)).toEqual(end);
  });

  it('gives the caret of an over-typed word past its target', () => {
    const events = [c(0, 'a'), c(100, 'x'), c(200, 'y')];
    expect(ghostPosition(base, ['a', 'b'], events, 500)).toEqual({ word: 0, char: 3 });
  });

  it('uses the line breaks in code mode: Enter at a line end moves the caret', () => {
    const config = { ...base, mode: 'code' as const };
    const code = { breaks: [true, false], indent: [0, 0] };
    const events: EngineEvent[] = [c(0, 'a'), c(100, ';'), { t: 200, k: 'n' }, c(300, 'b')];
    expect(ghostPosition(config, ['a;', 'b'], events, 150, code)).toEqual({ word: 0, char: 2 });
    expect(ghostPosition(config, ['a;', 'b'], events, 250, code)).toEqual({ word: 1, char: 0 });
    expect(ghostPosition(config, ['a;', 'b'], events, 300, code)).toEqual({ word: 1, char: 1 });
  });

  it('without the code lines an Enter does nothing, so the caret stays on the word', () => {
    const config = { ...base, mode: 'code' as const };
    const events: EngineEvent[] = [c(0, 'a'), c(100, ';'), { t: 200, k: 'n' }];
    expect(ghostPosition(config, ['a;', 'b'], events, 250)).toEqual({ word: 0, char: 2 });
  });
});
