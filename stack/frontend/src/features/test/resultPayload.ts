import type { Replay, ResultInput } from '@/lib/api/types';
import type { EngineState, TestConfig, TestResult } from '@/lib/engine/types';

/** The caps the server checks a replay against (src/results/results.schemas.ts). Past them the result is saved unverified. */
export const REPLAY_LIMITS = { words: 2000, wordLength: 40, events: 20_000 } as const;

/** mode2 for the saved result: time seconds, word count, quote length, pangram count, the date for daily, or the mode name. */
export function mode2Of(cfg: TestConfig, date: string): string {
  switch (cfg.mode) {
    case 'time':
      return String(cfg.time);
    case 'words':
      return String(cfg.words);
    case 'quote':
      return cfg.quoteLength;
    case 'pangram':
      return String(cfg.pangramCount);
    case 'custom':
      return 'custom';
    case 'zen':
      return 'zen';
    case 'daily':
      return date;
    case 'weak':
      return 'weak';
    case 'code':
      return cfg.codeLanguage;
  }
}

/**
 * The keystroke replay of a finished test: the target words (for time mode, including the words appended while
 * typing, which the log does not hold), every accepted input action, and the line structure of a code test.
 * Null when the test is too long for the server's caps, so it is saved unverified instead.
 */
export function buildReplay(state: EngineState): Replay | null {
  if (state.events.length === 0 || state.events.length > REPLAY_LIMITS.events) return null;
  if (state.words.length > REPLAY_LIMITS.words) return null;
  if (state.words.some((w) => w.length > REPLAY_LIMITS.wordLength)) return null;
  const replay: Replay = {
    v: 1,
    words: [...state.words],
    events: state.events.map((e) => (e.k === 'c' ? { t: e.t, k: e.k, ch: e.ch } : { t: e.t, k: e.k })),
  };
  if (state.config.mode === 'code' && state.code) {
    replay.code = { breaks: [...state.code.breaks], indent: [...state.code.indent] };
  }
  return replay;
}

/**
 * The body of POST /api/results for a finished test. Code snippets are English text, so a code result is
 * always sent as language 'en' (the server accepts no other language for code).
 */
export function toResultInput(cfg: TestConfig, r: TestResult, date: string, replay: Replay | null): ResultInput {
  const daily = cfg.mode === 'daily';
  return {
    mode: cfg.mode,
    mode2: mode2Of(cfg, date),
    language: cfg.mode === 'code' ? 'en' : cfg.language,
    wpm: r.wpm,
    rawWpm: r.rawWpm,
    accuracy: r.accuracy,
    consistency: r.consistency,
    durationMs: Math.round(r.durationMs),
    charStats: r.charStats,
    // Daily text is always punctuated and has no numbers, whatever the user's flags say.
    punctuation: daily ? true : cfg.punctuation,
    numbers: daily ? false : cfg.numbers,
    ...(replay ? { replay } : {}),
  };
}
