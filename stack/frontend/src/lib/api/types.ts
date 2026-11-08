import type { Language, Mode, QuoteLength } from '@/lib/engine/types';

export type PublicUser = { id: number; name: string; email: string; createdAt: string };

export type ResultInput = {
  mode: Mode;
  mode2: string; // max 16 chars
  language: Language;
  wpm: number; // 0..350
  rawWpm: number; // 0..400
  accuracy: number; // 0..100
  consistency: number; // 0..100
  durationMs: number; // int, 1000..3_600_000
  charStats: { correct: number; incorrect: number; extra: number; missed: number };
  punctuation: boolean;
  numbers: boolean;
};

export interface Quote {
  id: number;
  language: Language;
  text: string;
  source: string;
  length: number;
}

export interface Result {
  id: number;
  userId: number;
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
  punctuation: boolean;
  numbers: boolean;
  createdAt: string;
}

export type Summary = {
  totalTests: number;
  totalTimeMs: number;
  averageWpm: number;
  averageAccuracy: number; // over the last 10
  bests: Array<{
    mode: string;
    mode2: string;
    language: string;
    wpm: number;
    accuracy: number;
    createdAt: string;
  }>; // best per (mode, mode2, language)
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  createdAt: string;
};

export type LeaderboardQuery = { mode: string; mode2: string; language: Language };
export type QuoteQuery = { language: Language; length: QuoteLength };
