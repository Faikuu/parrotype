import { describe, it, expect } from 'vitest';
import { pacePosition } from './pace';

// 'hello world' is 11 chars: h e l l o (5) + space (1) + w o r l d (5).
const words = ['hello', 'world'];

describe('pacePosition', () => {
  it('starts at the first char', () => {
    expect(pacePosition(words, 60, 0)).toEqual({ word: 0, char: 0 });
  });

  it('a negative elapsed time counts as the start', () => {
    expect(pacePosition(words, 60, -500)).toEqual({ word: 0, char: 0 });
  });

  it('walks one char per 200 ms at 60 wpm', () => {
    expect(pacePosition(words, 60, 200)).toEqual({ word: 0, char: 1 });
    expect(pacePosition(words, 60, 1000)).toEqual({ word: 0, char: 5 });
    expect(pacePosition(words, 60, 1199)).toEqual({ word: 0, char: 5 });
  });

  it('mid-word', () => {
    expect(pacePosition(words, 60, 600)).toEqual({ word: 0, char: 3 });
  });

  it('crossing a space: after the first word and its space comes the second word', () => {
    // 6 chars: the 5 letters of 'hello' and the space.
    expect(pacePosition(words, 60, 1200)).toEqual({ word: 1, char: 0 });
    // 7 chars.
    expect(pacePosition(words, 60, 1400)).toEqual({ word: 1, char: 1 });
  });

  it('a walk that stops exactly at the end of a word sits before its space', () => {
    expect(pacePosition(words, 60, 1000)).toEqual({ word: 0, char: 5 });
    expect(pacePosition(['cat', 'dog'], 60, 600)).toEqual({ word: 0, char: 3 });
  });

  it('is proportional to wpm', () => {
    // 120 wpm for 1 s is 10 chars: 5 + 1 space + 4 => word 1, char 4.
    expect(pacePosition(words, 120, 1000)).toEqual({ word: 1, char: 4 });
  });

  it('returns null at the end of the text', () => {
    expect(pacePosition(words, 60, 2200)).toBeNull(); // 11 chars: the whole text
    expect(pacePosition(words, 60, 10_000)).toBeNull();
    expect(pacePosition(['cat'], 60, 600)).toBeNull(); // 3 chars: the whole text
    expect(pacePosition(['cat'], 60, 400)).toEqual({ word: 0, char: 2 });
  });

  it('returns null for wpm <= 0 or not a number, and for no words', () => {
    expect(pacePosition(words, 0, 1000)).toBeNull();
    expect(pacePosition(words, -60, 1000)).toBeNull();
    expect(pacePosition(words, Number.NaN, 1000)).toBeNull();
    expect(pacePosition([], 60, 1000)).toBeNull();
  });
});
