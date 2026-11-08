import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  engineReducer,
  getCharStates,
  isWordCorrect,
  needsMoreWords,
  elapsedMs,
  timeLeftMs,
  MAX_EXTRA_CHARS,
} from './engine';
import type { EngineState, TestConfig } from './types';

const base: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
};

function make(words: string[], config: Partial<TestConfig> = {}): EngineState {
  return createInitialState({ ...base, ...config }, words);
}

function typeText(state: EngineState, text: string, at: number, step = 100): EngineState {
  let s = state;
  let t = at;
  for (const ch of text) {
    if (ch === ' ') s = engineReducer(s, { type: 'space', at: t });
    else s = engineReducer(s, { type: 'char', char: ch, at: t });
    t += step;
  }
  return s;
}

describe('start and basic typing', () => {
  it('starts the test on the first char', () => {
    const s = engineReducer(make(['cat']), { type: 'char', char: 'c', at: 100 });
    expect(s.status).toBe('running');
    expect(s.startedAt).toBe(100);
    expect(s.keystrokes).toEqual([{ at: 100, correct: true }]);
    expect(s.typed[0]).toBe('c');
  });

  it('ignores space on an empty word', () => {
    const s = make(['cat']);
    expect(engineReducer(s, { type: 'space', at: 5 })).toBe(s);
  });

  it('records a keystroke for every char with correctness', () => {
    const s = typeText(make(['cat']), 'cx', 0);
    expect(s.keystrokes.map((k) => k.correct)).toEqual([true, false]);
  });

  it('space moves to the next word and marks untyped chars of the left word as missed', () => {
    const s = typeText(make(['hello', 'world']), 'hel ', 0);
    expect(s.current).toBe(1);
    const states = getCharStates(s, 0).map((c) => c.state);
    expect(states).toEqual(['correct', 'correct', 'correct', 'missed', 'missed']);
  });

  it('isWordCorrect is true only for an exact match', () => {
    const s = typeText(make(['cat', 'dog']), 'cat ', 0);
    expect(isWordCorrect(s, 0)).toBe(true);
    const wrong = typeText(make(['cat', 'dog']), 'cxt ', 0);
    expect(isWordCorrect(wrong, 0)).toBe(false);
  });
});

describe('extra characters', () => {
  it('allows at most 20 extra chars per word', () => {
    let s = typeText(make(['abc', 'def']), 'a', 0);
    for (let i = 0; i < 30; i++) s = engineReducer(s, { type: 'char', char: 'z', at: 200 + i });
    expect(s.typed[0]).toBe('a' + 'z'.repeat(MAX_EXTRA_CHARS + 2));
    expect(s.typed[0]?.length).toBe(3 + MAX_EXTRA_CHARS);
    expect(s.keystrokes.length).toBe(31);
    const extras = getCharStates(s, 0).filter((c) => c.state === 'extra');
    expect(extras).toHaveLength(MAX_EXTRA_CHARS);
  });
});

describe('backspace', () => {
  it('removes the last char of the current word', () => {
    const s = engineReducer(typeText(make(['cat']), 'ca', 0), { type: 'backspace', at: 500 });
    expect(s.typed[0]).toBe('c');
  });

  it('on an empty word goes back to an incorrect previous word and keeps its text', () => {
    const s = typeText(make(['cat', 'dog']), 'cx ', 0);
    expect(s.current).toBe(1);
    const back = engineReducer(s, { type: 'backspace', at: 500 });
    expect(back.current).toBe(0);
    expect(back.typed[0]).toBe('cx');
    expect(back.typed).toHaveLength(1);
  });

  it('on an empty word does not go back to a correct previous word', () => {
    const s = typeText(make(['cat', 'dog']), 'cat ', 0);
    expect(engineReducer(s, { type: 'backspace', at: 500 })).toBe(s);
  });

  it('word backspace clears the current word', () => {
    const s = engineReducer(typeText(make(['cat', 'dog']), 'cat do', 0), { type: 'backspace', at: 900, word: true });
    expect(s.current).toBe(1);
    expect(s.typed[1]).toBe('');
  });

  it('word backspace on an empty word goes back to the incorrect previous word and clears it', () => {
    const s = typeText(make(['cat', 'dog']), 'cx ', 0);
    const back = engineReducer(s, { type: 'backspace', at: 500, word: true });
    expect(back.current).toBe(0);
    expect(back.typed[0]).toBe('');
  });

  it('word backspace on an empty word does not go back to a correct word', () => {
    const s = typeText(make(['cat', 'dog']), 'cat ', 0);
    expect(engineReducer(s, { type: 'backspace', at: 500, word: true })).toBe(s);
  });
});

describe('stopOnError', () => {
  it("'letter': a wrong char is recorded as an error but not inserted", () => {
    const s = engineReducer(make(['cat'], { stopOnError: 'letter' }), { type: 'char', char: 'x', at: 0 });
    expect(s.typed[0]).toBe('');
    expect(s.keystrokes).toEqual([{ at: 0, correct: false }]);
    const ok = engineReducer(s, { type: 'char', char: 'c', at: 100 });
    expect(ok.typed[0]).toBe('c');
  });

  it("'word': space is blocked while the current word is wrong", () => {
    let s = typeText(make(['cat', 'dog'], { stopOnError: 'word' }), 'cx', 0);
    const blocked = engineReducer(s, { type: 'space', at: 500 });
    expect(blocked.current).toBe(0);
    s = engineReducer(s, { type: 'backspace', at: 600 });
    s = engineReducer(s, { type: 'backspace', at: 650 });
    s = engineReducer(s, { type: 'space', at: 700 });
    expect(s.current).toBe(0);
    s = typeText(s, 'cat', 1000);
    s = engineReducer(s, { type: 'space', at: 1500 });
    expect(s.current).toBe(1);
  });

  it("'word': a wrong word with extra chars also blocks space", () => {
    const s = typeText(make(['cat', 'dog'], { stopOnError: 'word' }), 'catz', 0);
    expect(engineReducer(s, { type: 'space', at: 500 }).current).toBe(0);
  });
});

describe('finishing in words mode', () => {
  it('finishes on the last correct char of the last word', () => {
    const s = typeText(make(['hi', 'yo']), 'hi yo', 1000, 100);
    expect(s.status).toBe('finished');
    expect(s.finishedAt).toBe(1000 + 4 * 100);
  });

  it('does not finish on a wrong last char until space', () => {
    let s = typeText(make(['hi']), 'hx', 0);
    expect(s.status).toBe('running');
    s = engineReducer(s, { type: 'space', at: 500 });
    expect(s.status).toBe('finished');
  });

  it('does not finish on the last char of a non-last word', () => {
    const s = typeText(make(['hi', 'yo']), 'hi', 0);
    expect(s.status).toBe('running');
    expect(s.current).toBe(0);
  });

  it('custom, quote and pangram modes finish like words mode', () => {
    for (const mode of ['custom', 'quote', 'pangram'] as const) {
      const s = typeText(make(['ok'], { mode }), 'ok', 0);
      expect(s.status).toBe('finished');
    }
  });

  it('ignores actions after finished, except reset', () => {
    const done = typeText(make(['hi']), 'hi', 0);
    expect(engineReducer(done, { type: 'char', char: 'x', at: 900 })).toBe(done);
    expect(engineReducer(done, { type: 'backspace', at: 900 })).toBe(done);
    expect(engineReducer(done, { type: 'finish', at: 900 })).toBe(done);
    const reset = engineReducer(done, { type: 'reset', words: ['new'], config: base });
    expect(reset.status).toBe('idle');
    expect(reset.words).toEqual(['new']);
  });

  it('explicit finish ends a running test and is ignored when idle', () => {
    const idle = make(['cat']);
    expect(engineReducer(idle, { type: 'finish', at: 10 })).toBe(idle);
    const running = typeText(make(['cat']), 'c', 0);
    const done = engineReducer(running, { type: 'finish', at: 700 });
    expect(done.status).toBe('finished');
    expect(done.finishedAt).toBe(700);
  });

  it('newline is ignored outside zen mode', () => {
    const s = typeText(make(['cat']), 'ca', 0);
    expect(engineReducer(s, { type: 'newline', at: 300 })).toBe(s);
  });
});

describe('time mode', () => {
  const time15 = { mode: 'time' as const, time: 15 as const };

  it('does not finish on the last word', () => {
    const s = typeText(make(['hi'], time15), 'hi', 0);
    expect(s.status).toBe('running');
  });

  it('finishes on tick once the time has elapsed', () => {
    let s = typeText(make(['hello'], time15), 'h', 0);
    s = engineReducer(s, { type: 'tick', at: 14999 });
    expect(s.status).toBe('running');
    s = engineReducer(s, { type: 'tick', at: 15000 });
    expect(s.status).toBe('finished');
    expect(s.finishedAt).toBe(15000);
  });

  it('clamps finishedAt to startedAt + time when a late tick arrives', () => {
    let s = typeText(make(['hello'], time15), 'h', 1000);
    s = engineReducer(s, { type: 'tick', at: 1000 + 16500 });
    expect(s.status).toBe('finished');
    expect(s.finishedAt).toBe(1000 + 15000);
  });

  it('records one sample per whole second with wpm/raw from that second', () => {
    let s = make(['hello', 'world'], { ...time15, time: 60 });
    s = typeText(s, 'hel', 100, 200); // keystrokes at rel 0, 200, 400
    s = engineReducer(s, { type: 'tick', at: 1100 });
    expect(s.samples).toHaveLength(1);
    expect(s.samples[0]).toEqual({ second: 1, wpm: 36, raw: 36, errors: 0 });
    s = engineReducer(s, { type: 'char', char: 'l', at: 1500 }); // rel 1400
    s = engineReducer(s, { type: 'tick', at: 2200 });
    expect(s.samples).toHaveLength(2);
    expect(s.samples[1]).toEqual({ second: 2, wpm: 12, raw: 12, errors: 0 });
  });

  it('puts errors from the last second on its sample and then resets the counter', () => {
    let s = make(['hello'], { ...time15, time: 60 });
    s = engineReducer(s, { type: 'char', char: 'x', at: 200 }); // wrong
    expect(s.errorsThisSecond).toBe(1);
    s = engineReducer(s, { type: 'tick', at: 1200 });
    expect(s.samples[0]?.errors).toBe(1);
    expect(s.samples[0]?.wpm).toBe(0);
    expect(s.samples[0]?.raw).toBe(12);
    expect(s.errorsThisSecond).toBe(0);
  });

  it('ignores ticks when not running', () => {
    const s = make(['hello'], time15);
    expect(engineReducer(s, { type: 'tick', at: 99999 })).toBe(s);
  });

  it('needsMoreWords is true when fewer than 40 words remain', () => {
    expect(needsMoreWords(make(new Array<string>(50).fill('a'), time15))).toBe(false);
    expect(needsMoreWords(make(new Array<string>(30).fill('a'), time15))).toBe(true);
    expect(needsMoreWords(make(new Array<string>(30).fill('a'), { mode: 'words' }))).toBe(false);
  });

  it('append adds words', () => {
    const s = engineReducer(make(['a'], time15), { type: 'append', words: ['b', 'c'] });
    expect(s.words).toEqual(['a', 'b', 'c']);
  });

  it('elapsedMs and timeLeftMs', () => {
    const idle = make(['a'], time15);
    expect(elapsedMs(idle, 5000)).toBe(0);
    expect(timeLeftMs(idle, 5000)).toBe(15000);
    const s = typeText(make(['hello'], time15), 'h', 1000);
    expect(elapsedMs(s, 4000)).toBe(3000);
    expect(timeLeftMs(s, 4000)).toBe(12000);
    expect(timeLeftMs(s, 1000 + 60000)).toBe(0);
    expect(timeLeftMs(make(['a'], { mode: 'words' }), 0)).toBeNull();
  });
});

describe('getCharStates', () => {
  it('shows pending chars on the current word and extras after the target', () => {
    const s = typeText(make(['ab']), 'ax', 0);
    expect(getCharStates(s, 0).map((c) => c.state)).toEqual(['correct', 'incorrect']);
    const over = engineReducer(s, { type: 'char', char: 'q', at: 500 });
    expect(getCharStates(over, 0).at(-1)).toEqual({ char: 'q', state: 'extra' });
    const future = getCharStates(make(['ab', 'cd']), 1).map((c) => c.state);
    expect(future).toEqual(['pending', 'pending']);
  });
});

describe('zen mode', () => {
  const zen = { mode: 'zen' as const };

  it('uses the typed text as the target and never marks chars wrong', () => {
    let s = make([], zen);
    expect(s.words).toEqual(['']);
    s = typeText(s, 'hi x', 0);
    expect(s.words).toEqual(['hi', 'x']);
    expect(s.typed).toEqual(['hi', 'x']);
    expect(s.keystrokes.every((k) => k.correct)).toBe(true);
    expect(getCharStates(s, 0).every((c) => c.state === 'correct')).toBe(true);
    expect(s.status).toBe('running');
  });

  it('space does not finish, and space on an empty word is a no-op', () => {
    const s = typeText(make([], zen), 'hi ', 0);
    expect(s.status).toBe('running');
    const twice = engineReducer(s, { type: 'space', at: 900 });
    expect(twice).toBe(s);
  });

  it('backspace keeps words in step with typed', () => {
    const s = engineReducer(typeText(make([], zen), 'hi', 0), { type: 'backspace', at: 300 });
    expect(s.typed[0]).toBe('h');
    expect(s.words).toEqual(['h']);
  });

  it('shift+enter (newline) finishes', () => {
    const s = engineReducer(typeText(make([], zen), 'hi', 0), { type: 'newline', at: 500 });
    expect(s.status).toBe('finished');
    expect(s.finishedAt).toBe(500);
  });

  it('newline on idle zen does nothing', () => {
    const s = make([], zen);
    expect(engineReducer(s, { type: 'newline', at: 5 })).toBe(s);
  });
});

describe('reducer purity', () => {
  it('does not mutate the previous state', () => {
    const s = make(['cat', 'dog']);
    const snapshot = JSON.stringify(s);
    typeText(s, 'cat d', 0);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
