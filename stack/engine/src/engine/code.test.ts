import { describe, it, expect } from 'vitest';
import { createInitialState, engineReducer } from './engine';
import { computeResult } from './stats';
import { replayStateAt } from './replay';
import { codeToWords } from '../text/code';
import type { EngineAction, EngineExtras, EngineState, TestConfig } from './types';

const base: TestConfig = {
  mode: 'code', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false, codeLanguage: 'js',
};

/** if (a) {  /  go();  /  } : the words, with `{` and `go();` ending lines. */
const SAMPLE = 'if (a) {\n  go();\n}';
const sample = codeToWords(SAMPLE);
const extras: EngineExtras = { code: { breaks: sample.breaks, indent: sample.indent } };

function make(words = sample.words, config: Partial<TestConfig> = {}, ex: EngineExtras | undefined = extras) {
  return createInitialState({ ...base, ...config }, words, ex);
}

/** Applies a list of keys: a string is typed char by char, '_' is space, '\n' is Enter. */
function keys(state: EngineState, script: string, start = 0, step = 100): EngineState {
  let s = state;
  let at = start;
  for (const ch of script) {
    let action: EngineAction;
    if (ch === '_') action = { type: 'space', at };
    else if (ch === '\n') action = { type: 'newline', at };
    else action = { type: 'char', char: ch, at };
    s = engineReducer(s, action);
    at += step;
  }
  return s;
}

describe('code mode: createInitialState and reset', () => {
  it('keeps the line structure in state.code', () => {
    const s = make();
    expect(s.code).toEqual(extras.code);
  });

  it('without extras there is no code and newline never separates', () => {
    const s = createInitialState(base, sample.words);
    expect(s.code).toBeUndefined();
    const typed = keys(s, 'if_(a)_{\n');
    expect(typed.current).toBe(2);
    expect(typed.events.some((e) => e.k === 'n')).toBe(false);
    expect(typed.events.at(-1)?.k).toBe('c');
  });

  it('reset passes the extras on', () => {
    const s = engineReducer(make(['x']), { type: 'reset', words: sample.words, config: base, extras });
    expect(s.code).toEqual(extras.code);
    expect(s.status).toBe('idle');
  });
});

describe('code mode: separators', () => {
  it('space at a line end is a no-op: state, events and keystrokes are unchanged', () => {
    const before = keys(make(), 'if_(a)_{');
    expect(before.current).toBe(2);
    const after = engineReducer(before, { type: 'space', at: 900 });
    expect(after).toBe(before);
    expect(after.events).toEqual(before.events);
  });

  it('Enter at a line end moves to the next word, like space elsewhere, and is logged as n', () => {
    const typed = keys(make(), 'if_(a)_{');
    const next = engineReducer(typed, { type: 'newline', at: 900 });
    expect(next.current).toBe(3);
    expect(next.events.at(-1)).toMatchObject({ k: 'n' });
    expect(next.keystrokes).toEqual(typed.keystrokes);
  });

  it('space inside a line still moves to the next word', () => {
    const s = keys(make(), 'if_');
    expect(s.current).toBe(1);
    expect(s.events.at(-1)).toMatchObject({ k: 's' });
  });

  it('Enter elsewhere (not at a line end) is a no-op', () => {
    const s = keys(make(), 'i');
    expect(engineReducer(s, { type: 'newline', at: 500 })).toBe(s);
    const empty = make();
    expect(engineReducer(empty, { type: 'newline', at: 500 })).toBe(empty);
  });

  it('Enter on an empty word at a line end is a no-op', () => {
    const s = keys(make(), 'if_(a)_');
    expect(s.current).toBe(2);
    expect(engineReducer(s, { type: 'newline', at: 900 })).toBe(s);
  });

  it('Enter at a line end with a wrong word and stop on word stays put', () => {
    const s = keys(make(sample.words, { stopOnError: 'word' }), 'ix');
    expect(s.current).toBe(0);
    expect(engineReducer(s, { type: 'newline', at: 900 })).toBe(s);
    const wrongEnd = keys(make(sample.words, { stopOnError: 'word' }), 'if_(a)_{x');
    expect(engineReducer(wrongEnd, { type: 'newline', at: 900 })).toBe(wrongEnd);
  });

  it('Enter does not finish a code test (only zen uses it that way)', () => {
    const s = keys(make(), 'if_(a)_{');
    expect(engineReducer(s, { type: 'newline', at: 900 }).status).toBe('running');
  });
});

describe('code mode: finishing', () => {
  it('finishes on the last correct char of the last word, like words mode', () => {
    const s = keys(make(), 'if_(a)_{\ngo();\n}');
    expect(s.status).toBe('finished');
    expect(s.current).toBe(4);
  });

  it('Enter after the last line break moves to the final word without finishing', () => {
    const s = keys(make(), 'if_(a)_{\ngo();\n');
    expect(s.status).toBe('running');
    expect(s.current).toBe(4);
  });

  it('a wrong last char does not finish until the word is correct (words rules)', () => {
    const s = keys(make(), 'if_(a)_{\ngo();\nx');
    expect(s.status).toBe('running');
  });
});

describe('code mode: stats', () => {
  it('counts line breaks like spaces: same typed text gives the same stats as a words test', () => {
    const code = keys(make(), 'if_(a)_{\ngo();\n}', 0, 150);
    const plain = keys(
      createInitialState({ ...base, mode: 'words' }, sample.words),
      'if_(a)_{_go();_}',
      0,
      150,
    );
    const a = computeResult(code);
    const b = computeResult(plain);
    expect(a.wpm).toBe(b.wpm);
    expect(a.rawWpm).toBe(b.rawWpm);
    expect(a.accuracy).toBe(b.accuracy);
    expect(a.charStats).toEqual(b.charStats);
    expect(a.durationMs).toBe(b.durationMs);
  });

  it('a line break that is typed wrong is not counted as correct', () => {
    const s = keys(make(), 'if_(a)_{\ngo();\n}');
    const withError = keys(make(), 'if_(a)_x');
    expect(computeResult(withError).accuracy).toBeLessThan(100);
    expect(computeResult(s).accuracy).toBe(100);
  });
});

describe('code mode: replay', () => {
  it('replaying the events with the extras reproduces the state, including the newline events', () => {
    const s = keys(make(), 'if_(a)_{\ngo();\n}', 0, 120);
    const replayed = replayStateAt(base, sample.words, s.events, Infinity, extras);
    expect(replayed.typed).toEqual(s.typed);
    expect(replayed.current).toBe(s.current);
    expect(replayed.status).toBe(s.status);
    expect(replayed.events).toEqual(s.events);
    expect(replayed.code).toEqual(s.code);
  });
});
