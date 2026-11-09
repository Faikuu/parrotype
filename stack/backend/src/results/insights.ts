import { LANGUAGES } from '../common/domain';
import { utcDate } from '../common/dates';

/** Pure insight computations over a user's results. No database, no clock: `now` is passed in. */

export const DAY_MS = 86_400_000;
/** The activity calendar covers this many UTC days, today included. */
export const ACTIVITY_DAYS = 365;
export const HOURS = 24;
const WPM_BUCKET = 10;
const PERFECT_MIN_CORRECT = 125;
const MARATHON_MODE2 = '120';

/** The columns the insights need. The service selects exactly these. */
export interface InsightRow {
  createdAt: Date;
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  accuracy: number;
  correctChars: number;
  durationMs: number;
}

export interface Streak {
  current: number;
  longest: number;
}

export interface ActivityDay {
  date: string;
  tests: number;
}

export interface HistogramBucket {
  from: number;
  count: number;
}

export interface HourBucket {
  hour: number;
  tests: number;
  avgWpm: number;
}

export const ACHIEVEMENT_IDS = [
  'first_test',
  'tests_100',
  'tests_1000',
  'wpm_60',
  'wpm_80',
  'wpm_100',
  'wpm_120',
  'wpm_150',
  'perfect',
  'marathon',
  'polyglot',
  'pangram_hunter',
  'daily_first',
  'streak_3',
  'streak_7',
  'streak_30',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface Achievement {
  id: AchievementId;
  unlockedAt: string;
}

export interface Insights {
  streak: Streak;
  activity: ActivityDay[];
  histogram: HistogramBucket[];
  byHour: HourBucket[];
  achievements: Achievement[];
}

/** UTC YYYY-MM-DD of a timestamp in ms. */
const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const dayOf = (date: Date): string => utcDay(date.getTime());
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Walks the distinct days in order. `longest` is the longest consecutive run, `lastRun` the
 * length of the run ending on the last day, and `reachedOn` maps each run length to the first
 * day a run reached it (a run grows by one day at a time, so every length appears once).
 */
function streakRuns(days: readonly string[]): {
  longest: number;
  lastRun: number;
  lastMs: number;
  reachedOn: Map<number, string>;
} {
  const reachedOn = new Map<number, string>();
  let run = 0;
  let longest = 0;
  let prevMs = Number.NaN;
  for (const day of [...new Set(days)].sort()) {
    const ms = dayMs(day);
    run = ms - prevMs === DAY_MS ? run + 1 : 1;
    prevMs = ms;
    longest = Math.max(longest, run);
    if (!reachedOn.has(run)) reachedOn.set(run, day);
  }
  return { longest, lastRun: run, lastMs: prevMs, reachedOn };
}

/**
 * Streaks over UTC days. `days` are YYYY-MM-DD strings with at least one test each (duplicates
 * and any order are fine). The current streak counts when its last day is today or yesterday.
 */
export function computeStreak(days: string[], today: string): Streak {
  const { longest, lastRun, lastMs } = streakRuns(days);
  if (longest === 0) return { current: 0, longest: 0 };
  const current = lastMs >= dayMs(today) - DAY_MS ? lastRun : 0;
  return { current, longest };
}

/** Tests per UTC day for the last ACTIVITY_DAYS days ending today, only days with tests, ascending. */
export function computeActivity(rows: readonly InsightRow[], now: Date): ActivityDay[] {
  const first = utcDate(-(ACTIVITY_DAYS - 1), now.getTime());
  const last = utcDate(0, now.getTime());
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = dayOf(row.createdAt);
    if (day < first || day > last) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, tests]) => ({ date, tests }));
}

/** Count of results per 10 wpm bucket (from = 0, 10, 20, ...). Only non-empty buckets, ascending. */
export function computeHistogram(rows: readonly InsightRow[]): HistogramBucket[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const from = Math.floor(row.wpm / WPM_BUCKET) * WPM_BUCKET;
    counts.set(from, (counts.get(from) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([from, count]) => ({ from, count }));
}

/** All 24 UTC hours. Hours without tests have tests 0 and avgWpm 0. */
export function computeByHour(rows: readonly InsightRow[]): HourBucket[] {
  const tests = new Array<number>(HOURS).fill(0);
  const wpmSum = new Array<number>(HOURS).fill(0);
  for (const row of rows) {
    const hour = row.createdAt.getUTCHours();
    tests[hour] += 1;
    wpmSum[hour] += row.wpm;
  }
  return Array.from({ length: HOURS }, (_, hour) => ({
    hour,
    tests: tests[hour],
    avgWpm: tests[hour] === 0 ? 0 : round1(wpmSum[hour] / tests[hour]),
  }));
}

const WPM_ACHIEVEMENTS: ReadonlyArray<readonly [number, AchievementId]> = [
  [60, 'wpm_60'],
  [80, 'wpm_80'],
  [100, 'wpm_100'],
  [120, 'wpm_120'],
  [150, 'wpm_150'],
];

const STREAK_ACHIEVEMENTS: ReadonlyArray<readonly [number, AchievementId]> = [
  [3, 'streak_3'],
  [7, 'streak_7'],
  [30, 'streak_30'],
];

const isCatalogLanguage = (language: string): boolean =>
  (LANGUAGES as readonly string[]).includes(language);

/**
 * Achievements with the time each was first unlocked. A test-count or wpm achievement takes the
 * createdAt of the result that satisfied it; polyglot and pangram_hunter take the result that
 * completed the set; a streak takes 00:00Z of the day the streak first reached its length.
 * Returned in unlock order (ties in ACHIEVEMENT_IDS order).
 */
export function computeAchievements(rows: readonly InsightRow[]): Achievement[] {
  const unlocked = new Map<AchievementId, string>();
  const unlock = (id: AchievementId, at: string): void => {
    if (!unlocked.has(id)) unlocked.set(id, at);
  };

  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const languages = new Set<string>();
  const pangramLanguages = new Set<string>();
  let tests = 0;

  for (const row of sorted) {
    const at = row.createdAt.toISOString();
    tests += 1;
    unlock('first_test', at);
    if (tests >= 100) unlock('tests_100', at);
    if (tests >= 1000) unlock('tests_1000', at);

    for (const [threshold, id] of WPM_ACHIEVEMENTS) {
      if (row.wpm >= threshold) unlock(id, at);
    }
    if (row.accuracy === 100 && row.correctChars >= PERFECT_MIN_CORRECT) unlock('perfect', at);
    if (row.mode === 'time' && row.mode2 === MARATHON_MODE2) unlock('marathon', at);
    if (row.mode === 'daily') unlock('daily_first', at);

    if (isCatalogLanguage(row.language)) {
      languages.add(row.language);
      if (languages.size === LANGUAGES.length) unlock('polyglot', at);
    }
    if (row.mode === 'pangram') {
      pangramLanguages.add(row.language);
      if (pangramLanguages.size >= 2) unlock('pangram_hunter', at);
    }
  }

  const { reachedOn } = streakRuns(sorted.map((row) => dayOf(row.createdAt)));
  for (const [length, id] of STREAK_ACHIEVEMENTS) {
    const day = reachedOn.get(length);
    if (day !== undefined) unlock(id, new Date(dayMs(day)).toISOString());
  }

  const order = new Map<AchievementId, number>(ACHIEVEMENT_IDS.map((id, index) => [id, index]));
  return [...unlocked]
    .map(([id, unlockedAt]) => ({ id, unlockedAt }))
    .sort((a, b) => {
      if (a.unlockedAt !== b.unlockedAt) return a.unlockedAt < b.unlockedAt ? -1 : 1;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
}

/** Everything the insights endpoint returns. */
export function buildInsights(rows: readonly InsightRow[], now: Date): Insights {
  return {
    streak: computeStreak(rows.map((row) => dayOf(row.createdAt)), utcDate(0, now.getTime())),
    activity: computeActivity(rows, now),
    histogram: computeHistogram(rows),
    byHour: computeByHour(rows),
    achievements: computeAchievements(rows),
  };
}
