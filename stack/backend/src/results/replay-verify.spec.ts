import {
  CODE_SNIPPETS,
  codeToWords,
  computeResult,
  dailyWords,
  type EngineExtras,
  type EngineState,
  type TestConfig,
} from '@parrotype/engine';
import { base, liveRun, POOL, replayOf, resultFields, typeWords, type Key } from '../../test/replay.fixtures';
import {
  configFor,
  dailyTextMatches,
  eventTextWords,
  matchReplay,
  statMismatches,
  type VerifyInput,
} from './replay-verify';

/** The submitted fields for a finished run, typed for the verifier. */
const inputFor = (config: TestConfig, state: EngineState, mode: VerifyInput['mode'], mode2: string): VerifyInput =>
  resultFields(config, state, mode, mode2) as VerifyInput;

describe('replay verification: runs the frontend would save', () => {
  it('accepts a 10-word test typed with mistakes', () => {
    const config: TestConfig = { ...base, mode: 'words', words: 10 };
    const words = POOL.slice(0, 10);
    const state = liveRun(config, words, {}, typeWords(words, 1, { mistakeRate: 0.15, startAt: 1000 }));
    expect(state.status).toBe('finished');

    expect(matchReplay(inputFor(config, state, 'words', '10'), replayOf(state))).toEqual({ matched: true, fields: [] });
  });

  it('accepts a 15-second time test: the timer ends it, the tick samples count', () => {
    const config: TestConfig = { ...base, mode: 'time', time: 15 };
    const words = Array.from({ length: 300 }, (_, i) => POOL[(i * 7) % POOL.length] ?? 'the');
    const keys = typeWords(words.slice(0, 120), 2, { mistakeRate: 0.08, startAt: 500 });
    const state = liveRun(config, words, {}, keys);
    expect(state.status).toBe('finished');
    expect(computeResult(state).durationMs).toBe(15_000);

    const verdict = matchReplay(inputFor(config, state, 'time', '15'), replayOf(state));
    expect(verdict).toEqual({ matched: true, fields: [] });
  });

  it('accepts a code test with line breaks', () => {
    const { words, breaks, indent } = codeToWords(CODE_SNIPPETS.js[0]!.code);
    const extras: EngineExtras = { code: { breaks, indent } };
    const config: TestConfig = { ...base, mode: 'code', language: 'en', codeLanguage: 'js' };
    const keys: Key[] = [];
    let at = 0;
    words.forEach((word, i) => {
      for (const ch of word) {
        at += 150;
        keys.push({ at, kind: 'c', ch });
      }
      if (i < words.length - 1) {
        at += 150;
        keys.push(breaks[i] ? { at, kind: 'n' } : { at, kind: 's' });
      }
    });
    const state = liveRun(config, words, extras, keys);
    expect(state.status).toBe('finished');

    const replay = replayOf(state, extras);
    expect(matchReplay(inputFor(config, state, 'code', 'js'), replay).matched).toBe(true);
  });

  it('accepts a zen test, finished with Shift+Enter', () => {
    const config: TestConfig = { ...base, mode: 'zen' };
    const text = 'hello there friend';
    const keys: Key[] = [];
    let at = 0;
    for (const ch of text) {
      at += 140;
      keys.push(ch === ' ' ? { at, kind: 's' } : { at, kind: 'c', ch });
    }
    at += 300;
    keys.push({ at, kind: 'n' });
    const state = liveRun(config, [], {}, keys);
    expect(state.status).toBe('finished');

    const verdict = matchReplay(inputFor(config, state, 'zen', 'zen'), replayOf(state));
    expect(verdict.matched).toBe(true);
  });

  it('accepts a words test played with stopOnError=letter, which the result does not record', () => {
    const config: TestConfig = { ...base, mode: 'words', words: 10, stopOnError: 'letter' };
    const words = POOL.slice(0, 10);
    const state = liveRun(config, words, {}, typeWords(words, 4, { mistakeRate: 0.2, startAt: 0, backspace: false }));
    expect(state.status).toBe('finished');
    expect(state.keystrokes.some((k) => !k.correct)).toBe(true);

    const verdict = matchReplay(inputFor(config, state, 'words', '10'), replayOf(state));
    expect(verdict.matched).toBe(true);
  });

  it('accepts a run that ends just after a whole second, whichever tick phase the frontend had', () => {
    // A 32-letter word typed from 0 ms: 29 keys in the first three seconds, two in the fourth, the last at 4050 ms. Whether the fourth second had a sample tick before the finish changes consistency a lot, so
    // both tick phases must be accepted, and the candidate for the missing sample is what makes that work.
    const config: TestConfig = { ...base, mode: 'words', words: 10 };
    const word = 'abcdefghijklmnopqrstuvwxyzabcdef';
    const times = [...Array.from({ length: 29 }, (_, i) => 100 * i), 3400, 3700, 4050];
    const keys: Key[] = times.map((at, i) => ({ at, kind: 'c', ch: word.charAt(i) }));
    for (const phase of [100, 60]) {
      const state = liveRun(config, [word], {}, keys, 100, phase);
      expect(state.status).toBe('finished');
      expect(computeResult(state).durationMs).toBe(4050);
      expect(matchReplay(inputFor(config, state, 'words', '10'), replayOf(state)).matched).toBe(true);
    }
  });
});

describe('replay verification: tampered results are rejected', () => {
  const config: TestConfig = { ...base, mode: 'words', words: 10 };
  const words = POOL.slice(0, 10);
  const keys = typeWords(words, 9, { mistakeRate: 0.15, startAt: 1000 });
  const state = liveRun(config, words, {}, keys);
  const honest = inputFor(config, state, 'words', '10');
  const replay = replayOf(state);

  it('the honest submission matches (the control)', () => {
    expect(matchReplay(honest, replay).matched).toBe(true);
  });

  it('rejects an inflated wpm', () => {
    const verdict = matchReplay({ ...honest, wpm: honest.wpm + 5 }, replay);
    expect(verdict).toMatchObject({ matched: false, fields: ['wpm'] });
  });

  it('rejects a changed accuracy, raw wpm, consistency and duration', () => {
    expect(matchReplay({ ...honest, accuracy: 100 }, replay).matched).toBe(false);
    expect(matchReplay({ ...honest, rawWpm: honest.rawWpm + 3 }, replay).matched).toBe(false);
    expect(matchReplay({ ...honest, consistency: honest.consistency - 20 }, replay).matched).toBe(false);
    expect(matchReplay({ ...honest, durationMs: honest.durationMs + 1000 }, replay).matched).toBe(false);
  });

  it('rejects inflated character counts', () => {
    const cs = { ...honest.charStats, correct: honest.charStats.correct + 1 };
    expect(matchReplay({ ...honest, charStats: cs }, replay).matched).toBe(false);
  });

  it('rejects an event log with a keystroke removed', () => {
    const middle = Math.floor(replay.events.length / 2);
    const events = replay.events.filter((_, i) => i !== middle);
    expect(matchReplay(honest, { ...replay, events }).matched).toBe(false);
  });

  it('rejects an event log whose timing makes the run longer', () => {
    const events = replay.events.map((e, i) => (i >= 3 ? { ...e, t: e.t + 3000 } : e));
    expect(matchReplay(honest, { ...replay, events }).matched).toBe(false);
  });

  it('rejects a replay whose words differ from the typed words', () => {
    const swapped = replay.words.map((w, i) => (i === 0 ? 'zzz' : w));
    expect(matchReplay(honest, { ...replay, words: swapped }).matched).toBe(false);
  });

  it('rejects a replay that never finishes', () => {
    const events = replay.events.slice(0, replay.events.length - 2);
    expect(matchReplay(honest, { ...replay, events }).matched).toBe(false);
  });
});

describe('statMismatches', () => {
  const computed = {
    failed: false, wpm: 60, rawWpm: 70, accuracy: 95, consistency: 80, durationMs: 10_000,
    charStats: { correct: 50, incorrect: 2, extra: 0, missed: 0 }, samples: [], keyStats: {},
  };
  const submitted: VerifyInput = {
    mode: 'words', mode2: '10', language: 'en', punctuation: false, numbers: false,
    wpm: 60.4, rawWpm: 69.6, accuracy: 95.5, consistency: 79.5, durationMs: 10_150,
    charStats: { correct: 50, incorrect: 2, extra: 0, missed: 0 },
  };

  it('allows the rounding tolerances: rates and percentages 0.5, duration 200 ms', () => {
    expect(statMismatches(submitted, computed as never)).toEqual([]);
  });

  it('flags a field outside its tolerance, and any character count that differs', () => {
    expect(statMismatches({ ...submitted, wpm: 61 }, computed as never)).toEqual(['wpm']);
    expect(statMismatches({ ...submitted, durationMs: 10_300 }, computed as never)).toEqual(['durationMs']);
    expect(statMismatches({ ...submitted, charStats: { ...submitted.charStats, missed: 1 } }, computed as never)).toEqual(['charStats']);
  });
});

describe('configFor', () => {
  it('derives the engine config from the result fields', () => {
    expect(configFor({ mode: 'time', mode2: '30', language: 'pl', punctuation: true, numbers: false })).toMatchObject({
      mode: 'time', time: 30, language: 'pl', punctuation: true,
    });
    expect(configFor({ mode: 'code', mode2: 'py', language: 'en', punctuation: false, numbers: false })).toMatchObject({
      mode: 'code', codeLanguage: 'py',
    });
    expect(configFor({ mode: 'pangram', mode2: '3', language: 'en', punctuation: false, numbers: false })).toMatchObject({
      mode: 'pangram', pangramCount: 3,
    });
    expect(configFor({ mode: 'event', mode2: 'spring-cup', language: 'en', punctuation: false, numbers: false })).toMatchObject({
      mode: 'custom',
    });
    expect(configFor({ mode: 'words', mode2: '25', language: 'en', punctuation: false, numbers: false }, 'word')).toMatchObject({
      mode: 'words', words: 25, stopOnError: 'word',
    });
  });
});

describe('text checks', () => {
  it('daily: the words must be the day\'s words for the language', () => {
    const date = '2026-11-09';
    expect(dailyTextMatches(dailyWords(date, 'en'), date, 'en')).toBe(true);
    expect(dailyTextMatches(dailyWords(date, 'pl'), date, 'en')).toBe(false);
    expect(dailyTextMatches(dailyWords('2026-11-08', 'en'), date, 'en')).toBe(false);
    const changed = dailyWords(date, 'en').map((w, i) => (i === 3 ? `${w}x` : w));
    expect(dailyTextMatches(changed, date, 'en')).toBe(false);
  });

  it('event text is split the way quotes are', () => {
    expect(eventTextWords('  one   two\nthree ')).toEqual(['one', 'two', 'three']);
  });
});
