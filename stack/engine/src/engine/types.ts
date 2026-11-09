export type Mode = 'time' | 'words' | 'quote' | 'zen' | 'pangram' | 'custom' | 'daily' | 'weak' | 'code';
export type CodeLanguage = 'js' | 'py' | 'rs' | 'go';
export type Language = 'en' | 'pl' | 'de' | 'es';
export type TimeOption = 15 | 30 | 60 | 120;
export type WordsOption = 10 | 25 | 50 | 100;
export type QuoteLength = 'short' | 'medium' | 'long' | 'any';
export type PangramCount = 1 | 3 | 5;

export interface TestConfig {
  mode: Mode; time: TimeOption; words: WordsOption; quoteLength: QuoteLength;
  pangramCount: PangramCount; punctuation: boolean; numbers: boolean;
  language: Language; customText: string;
  /** Snippet language for mode 'code'. */
  codeLanguage: CodeLanguage;
  stopOnError: 'off' | 'letter' | 'word';
  /** Backspace and word-backspace do nothing. */
  noBackspace: boolean;
  /** The first incorrect or extra char finishes the test as failed. */
  suddenDeath: boolean;
}
export type CharState = 'pending' | 'correct' | 'incorrect' | 'extra' | 'missed';
/** `expected` is the target char at the cursor ('' for extra chars and in zen). */
export interface Keystroke { at: number; correct: boolean; expected: string }      // ms timestamps
export interface SecondSample { second: number; wpm: number; raw: number; errors: number }
/**
 * One accepted input action after the test started. `t` is ms since the start (0 for the first char).
 * `k`: 'c' char, 's' space, 'b' backspace, 'B' word backspace, 'n' newline. `ch` is set for 'c' only.
 */
export interface EngineEvent { t: number; k: 'c' | 's' | 'b' | 'B' | 'n'; ch?: string }
/**
 * Line structure of a code test (see lib/text/code.ts). `breaks[i]` is true when word i ends its line, so the
 * separator after it is Enter. `indent[i]` is the leading spaces of the line when word i starts it.
 */
export interface CodeLines { breaks: boolean[]; indent: number[] }
/** Optional inputs that some configs need to build or replay a state. */
export interface EngineExtras { code?: CodeLines }
export interface EngineState {
  status: 'idle' | 'running' | 'finished';
  config: TestConfig;
  words: string[];          // target words
  typed: string[];          // typed[i] = what the user typed for word i ('' for current if nothing yet)
  current: number;          // index of the active word
  startedAt: number | null; finishedAt: number | null;
  keystrokes: Keystroke[];
  samples: SecondSample[];  // one per elapsed whole second, pushed on 'tick'
  errorsThisSecond: number;
  events: EngineEvent[];    // every accepted input action since the start, including no-ops (see replay.ts)
  failed: boolean;          // sudden death: the test ended on a wrong or extra char
  /** Line breaks and indentation, in code mode only. */
  code?: CodeLines;
}
export type EngineAction =
  | { type: 'reset'; words: string[]; config: TestConfig; extras?: EngineExtras }
  | { type: 'char'; char: string; at: number }     // any printable char except space; starts the test if idle
  | { type: 'space'; at: number }
  | { type: 'backspace'; at: number; word?: boolean }   // word=true => ctrl/alt+backspace clears the word
  | { type: 'newline'; at: number }                // zen: shift+enter finishes; other modes ignore
  | { type: 'tick'; at: number }                   // called by the UI ~every 100ms while running; records samples, finishes time mode
  | { type: 'append'; words: string[] }            // infinite modes (time, zen-not-needed)
  | { type: 'finish'; at: number };
/** Hits and misses for one key. Fractional after mergeKeyStats (decay). */
export interface KeyStat { hits: number; misses: number }
export type KeyStatsMap = Record<string, KeyStat>;
export interface TestResult {
  failed: boolean;
  wpm: number; rawWpm: number; accuracy: number; consistency: number; durationMs: number;
  charStats: { correct: number; incorrect: number; extra: number; missed: number };
  samples: SecondSample[];
  keyStats: KeyStatsMap;
}
