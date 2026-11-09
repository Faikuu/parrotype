// Mirrors the backend types (docs/SPEC.md and docs/SPEC-2.1.md). Kept local to the API layer,
// so the wire format does not depend on the engine's in-progress unions.
export type Language = 'en' | 'pl' | 'de' | 'es';
export type Mode = 'time' | 'words' | 'quote' | 'zen' | 'pangram' | 'custom' | 'daily' | 'weak';
export type QuoteLength = 'short' | 'medium' | 'long' | 'any';

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
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  charStats: { correct: number; incorrect: number; extra: number; missed: number };
  punctuation: boolean;
  numbers: boolean;
  createdAt: string;
}

export type BestEntry = {
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  accuracy: number;
  createdAt: string;
};

export type Summary = {
  totalTests: number;
  totalTimeMs: number;
  averageWpm: number;
  averageAccuracy: number; // over the last 10
  bests: BestEntry[]; // best per (mode, mode2, language)
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  createdAt: string;
};

export type RecentResult = {
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  accuracy: number;
  createdAt: string;
};

export type PublicProfile = {
  name: string;
  createdAt: string;
  totalTests: number;
  totalTimeMs: number;
  bests: BestEntry[]; // ranked modes only, best per (mode, mode2, language)
  recent: RecentResult[]; // last 10
  streak: Streak;
  achievements: Achievement[]; // in unlock order
  activity: ActivityDay[]; // last 365 UTC days, only days with tests
};

// Insights, achievements and export (docs/SPEC-2.2.md). Mirrors stack/backend/src/results/insights.ts.
export type Streak = { current: number; longest: number };
export type ActivityDay = { date: string; tests: number }; // YYYY-MM-DD (UTC)
export type HistogramBucket = { from: number; count: number }; // wpm buckets of 10
export type HourBucket = { hour: number; tests: number; avgWpm: number }; // 0-23 UTC

export type AchievementId =
  | 'first_test'
  | 'tests_100'
  | 'tests_1000'
  | 'wpm_60'
  | 'wpm_80'
  | 'wpm_100'
  | 'wpm_120'
  | 'wpm_150'
  | 'perfect'
  | 'marathon'
  | 'polyglot'
  | 'pangram_hunter'
  | 'daily_first'
  | 'streak_3'
  | 'streak_7'
  | 'streak_30';

export type Achievement = { id: AchievementId; unlockedAt: string };

export type Insights = {
  streak: Streak;
  activity: ActivityDay[];
  histogram: HistogramBucket[];
  byHour: HourBucket[];
  achievements: Achievement[];
};

export type ExportFormat = 'csv' | 'json';

export type LeaderboardQuery = { mode: string; mode2: string; language: Language };
export type QuoteQuery = { language: Language; length: QuoteLength };
