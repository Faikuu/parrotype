import { LESSONS, type Lesson } from '@/lib/text/lessons';

/** localStorage key for the Learn progress. */
export const LESSONS_STORAGE_KEY = 'parrotype:lessons';

/** What is kept per passed or attempted lesson. Best values across attempts. */
export interface LessonRecord {
  passed: boolean;
  bestWpm: number;
  bestAcc: number;
}
export type LessonProgress = Record<string, LessonRecord>;

export interface LessonResult {
  wpm: number;
  accuracy: number;
}

export type LessonStatus = 'locked' | 'available' | 'passed';

export interface LessonRow {
  lesson: Lesson;
  /** 1-based position in the path. */
  number: number;
  status: LessonStatus;
  /** For a locked lesson: the number of the first earlier lesson that is not passed yet. */
  blockedBy: number | null;
  record: LessonRecord | null;
}

const KNOWN_IDS = new Set(LESSONS.map((l) => l.id));

/** A lesson passes when both goals are met: at least goalWpm and goalAcc. */
export function passes(lesson: Lesson, result: LessonResult): boolean {
  return result.wpm >= lesson.goalWpm && result.accuracy >= lesson.goalAcc;
}

/**
 * Keeps only well-formed records for known lessons. Anything else (a corrupt entry, a renamed lesson,
 * a value out of range) is dropped rather than trusted.
 */
export function parseProgress(raw: unknown): LessonProgress {
  const out: LessonProgress = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_IDS.has(id) || !value || typeof value !== 'object') continue;
    const r = value as Record<string, unknown>;
    const { passed, bestWpm, bestAcc } = r;
    if (typeof passed !== 'boolean') continue;
    if (typeof bestWpm !== 'number' || !Number.isFinite(bestWpm) || bestWpm < 0 || bestWpm > 350) continue;
    if (typeof bestAcc !== 'number' || !Number.isFinite(bestAcc) || bestAcc < 0 || bestAcc > 100) continue;
    out[id] = { passed, bestWpm, bestAcc };
  }
  return out;
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads the progress. Unreadable, missing or invalid data gives an empty progress. */
export function loadProgress(storage: Storage | null = defaultStorage()): LessonProgress {
  if (!storage) return {};
  try {
    const raw = storage.getItem(LESSONS_STORAGE_KEY);
    return raw === null ? {} : parseProgress(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Writes the progress. Returns false when it could not be stored (private mode, full quota, no storage):
 * the page still works from memory for this visit.
 */
export function saveProgress(progress: LessonProgress, storage: Storage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LESSONS_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

/** Records one attempt. A pass is sticky, and the best wpm and accuracy only ever go up. */
export function recordAttempt(progress: LessonProgress, lesson: Lesson, result: LessonResult): LessonProgress {
  const prev = progress[lesson.id];
  return {
    ...progress,
    [lesson.id]: {
      passed: prev?.passed === true || passes(lesson, result),
      bestWpm: Math.max(prev?.bestWpm ?? 0, result.wpm),
      bestAcc: Math.max(prev?.bestAcc ?? 0, result.accuracy),
    },
  };
}

/**
 * The path with each lesson's status. Lessons open in order: a lesson is available once every lesson
 * before it is passed. Passed lessons stay open for replay.
 */
export function lessonRows(progress: LessonProgress, lessons: readonly Lesson[] = LESSONS): LessonRow[] {
  let blocker: number | null = null;
  return lessons.map((lesson, i) => {
    const record = progress[lesson.id] ?? null;
    const passed = record?.passed === true;
    const status: LessonStatus = blocker !== null ? 'locked' : passed ? 'passed' : 'available';
    const row: LessonRow = { lesson, number: i + 1, status, blockedBy: blocker, record };
    if (!passed && blocker === null) blocker = i + 1;
    return row;
  });
}

/** The lesson after `id`, when it exists. */
export function nextLesson(id: string, lessons: readonly Lesson[] = LESSONS): Lesson | null {
  const i = lessons.findIndex((l) => l.id === id);
  return i >= 0 ? (lessons[i + 1] ?? null) : null;
}
