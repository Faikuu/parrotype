export type Mode = 'time' | 'words' | 'quote' | 'zen' | 'pangram' | 'custom';
export type Language = 'en' | 'pl';
export type TimeOption = 15 | 30 | 60 | 120;
export type WordsOption = 10 | 25 | 50 | 100;
export type QuoteLength = 'short' | 'medium' | 'long' | 'any';
export type PangramCount = 1 | 3 | 5;

export interface TestConfig {
  mode: Mode; time: TimeOption; words: WordsOption; quoteLength: QuoteLength;
  pangramCount: PangramCount; punctuation: boolean; numbers: boolean;
  language: Language; customText: string;
  stopOnError: 'off' | 'letter' | 'word';
}
export type CharState = 'pending' | 'correct' | 'incorrect' | 'extra' | 'missed';
export interface Keystroke { at: number; correct: boolean }      // ms timestamps
export interface SecondSample { second: number; wpm: number; raw: number; errors: number }
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
}
export type EngineAction =
  | { type: 'reset'; words: string[]; config: TestConfig }
  | { type: 'char'; char: string; at: number }     // any printable char except space; starts the test if idle
  | { type: 'space'; at: number }
  | { type: 'backspace'; at: number; word?: boolean }   // word=true => ctrl/alt+backspace clears the word
  | { type: 'newline'; at: number }                // zen: shift+enter finishes; other modes ignore
  | { type: 'tick'; at: number }                   // called by the UI ~every 100ms while running; records samples, finishes time mode
  | { type: 'append'; words: string[] }            // infinite modes (time, zen-not-needed)
  | { type: 'finish'; at: number };
export interface TestResult {
  wpm: number; rawWpm: number; accuracy: number; consistency: number; durationMs: number;
  charStats: { correct: number; incorrect: number; extra: number; missed: number };
  samples: SecondSample[];
}
