// Mirrors the backend types (docs/SPEC.md and docs/SPEC-2.1.md). Kept local to the API layer,
// so the wire format does not depend on the engine's in-progress unions.
export type Language = 'en' | 'pl' | 'de' | 'es';
export type Mode = 'time' | 'words' | 'quote' | 'zen' | 'pangram' | 'custom' | 'daily' | 'weak' | 'code';
export type QuoteLength = 'short' | 'medium' | 'long' | 'any';


export type PublicUser = {
  id: number;
  name: string;
  email: string;
  /** Sorted. Empty for ordinary users. Any permission grants admin.access. */
  permissions: string[];
  createdAt: string;
};

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
  followers: number;
  following: number;
  /** False for anonymous viewers and for your own profile. */
  isFollowing: boolean;
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

export type LeaderboardScope = 'all' | 'following';
export type LeaderboardQuery = { mode: string; mode2: string; language: Language; scope?: LeaderboardScope };

// Friends and moderation (docs/SPEC-2.3.md).
export type ReportReason = 'name' | 'cheating' | 'other';
export type ReportInput = { reason: ReportReason; details?: string };
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type FollowState = { following: boolean };

// Admin panel (docs/SPEC-2.4.md, all under /api/admin). Lists are paginated: { items, total, page, pageSize }.
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
export type SortOrder = 'asc' | 'desc';

export type AdminStats = {
  users: { total: number; new7d: number; banned: number };
  results: { total: number; today: number; last7d: number };
  reports: { open: number };
  races: { rooms: number; players: number };
  signupsByDay: DayCount[];
  resultsByDay: DayCount[];
};
export type DayCount = { date: string; count: number };

export type AdminGroup = {
  id: number;
  name: string;
  description: string;
  system: boolean;
  permissions: string[];
  memberCount: number;
  updatedAt: string;
};
export type GroupMember = { id: number; name: string; bannedAt: string | null };
export type AdminGroupDetail = AdminGroup & { members: GroupMember[] };

export type GroupRef = { id: number; name: string };
export type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  bannedAt: string | null;
  groups: GroupRef[];
  resultCount: number;
};
export type AdminResultRow = {
  id: number;
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  createdAt: string;
};
export type AdminUserReportRef = {
  id: number;
  reason: ReportReason;
  status: ReportStatus;
  details: string | null;
  createdAt: string;
  reporter: { id: number; name: string };
  target: { id: number; name: string };
};
export type AdminUserDetail = AdminUserRow & {
  banReason: string | null;
  effectivePermissions: string[];
  /** What the user's groups grant, ignoring a suspension: decides who may manage them. */
  heldPermissions: string[];
  stats: { tests: number; bestWpm: number | null; lastResultAt: string | null };
  recentResults: AdminResultRow[];
  reportsReceived: AdminUserReportRef[];
  reportsMade: AdminUserReportRef[];
};

export type AdminResult = AdminResultRow & { user: { id: number; name: string } };

export type AdminReport = {
  id: number;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: number; name: string };
  target: { id: number; name: string; bannedAt: string | null; banReason: string | null };
  targetResults: AdminResultRow[];
};

export type AdminQuote = Quote;

export type AdminRacePlayer = { name: string; isGuest: boolean; connected: boolean; progress: number };
export type AdminRace = {
  id: string;
  language: Language;
  status: string;
  players: AdminRacePlayer[];
  createdAt: string;
  lastActivity: string;
};

export type AdminAuditEntry = {
  id: number;
  adminId: number | null;
  /** Null for CLI actions and for admins deleted since. */
  adminName: string | null;
  action: string;
  target: string;
  note: string | null;
  createdAt: string;
};
