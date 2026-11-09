import { LESSONS } from '@/lib/text/lessons';
import {
  LESSONS_STORAGE_KEY,
  lessonRows,
  loadProgress,
  nextLesson,
  parseProgress,
  passes,
  recordAttempt,
  saveProgress,
} from './progress';

const [first, second, third] = LESSONS;

beforeEach(() => {
  localStorage.clear();
});

describe('lesson lock and unlock', () => {
  it('opens only the first lesson on an empty progress', () => {
    const rows = lessonRows({});
    expect(rows[0]?.status).toBe('available');
    expect(rows.slice(1).every((r) => r.status === 'locked')).toBe(true);
    expect(rows[1]?.blockedBy).toBe(1);
  });

  it('unlocks the next lesson once the one before it is passed', () => {
    const progress = recordAttempt({}, first!, { wpm: 30, accuracy: 99 });
    const rows = lessonRows(progress);
    expect(rows[0]?.status).toBe('passed');
    expect(rows[1]?.status).toBe('available');
    expect(rows[2]?.status).toBe('locked');
    expect(rows[2]?.blockedBy).toBe(2);
  });

  it('names the first unpassed earlier lesson as the blocker', () => {
    const progress = recordAttempt({}, second!, { wpm: 30, accuracy: 99 });
    const rows = lessonRows(progress);
    // Lesson 2 is passed, but lesson 1 is not, so lesson 3 stays behind lesson 1.
    expect(rows[1]?.status).toBe('locked');
    expect(rows[1]?.blockedBy).toBe(1);
    expect(rows[2]?.blockedBy).toBe(1);
  });

  it('keeps passed lessons open for replay', () => {
    const progress = recordAttempt(recordAttempt({}, first!, { wpm: 30, accuracy: 99 }), second!, {
      wpm: 30,
      accuracy: 99,
    });
    expect(lessonRows(progress).slice(0, 2).map((r) => r.status)).toEqual(['passed', 'passed']);
  });

  it('needs both goals to pass', () => {
    expect(passes(first!, { wpm: first!.goalWpm, accuracy: first!.goalAcc })).toBe(true);
    expect(passes(first!, { wpm: first!.goalWpm - 1, accuracy: 100 })).toBe(false);
    expect(passes(first!, { wpm: 100, accuracy: first!.goalAcc - 1 })).toBe(false);
  });

  it('does not unlock on a failed attempt, but keeps the best values', () => {
    const failed = recordAttempt({}, first!, { wpm: 5, accuracy: 80 });
    expect(failed[first!.id]).toEqual({ passed: false, bestWpm: 5, bestAcc: 80 });
    const better = recordAttempt(failed, first!, { wpm: 9, accuracy: 70 });
    expect(better[first!.id]).toEqual({ passed: false, bestWpm: 9, bestAcc: 80 });
    expect(lessonRows(better)[1]?.status).toBe('locked');
  });

  it('keeps a pass when a later attempt fails', () => {
    const passed = recordAttempt({}, first!, { wpm: 30, accuracy: 99 });
    const after = recordAttempt(passed, first!, { wpm: 1, accuracy: 10 });
    expect(after[first!.id]?.passed).toBe(true);
    expect(after[first!.id]?.bestWpm).toBe(30);
  });

  it('finds the next lesson', () => {
    expect(nextLesson(first!.id)?.id).toBe(second!.id);
    expect(nextLesson(LESSONS[LESSONS.length - 1]!.id)).toBeNull();
    expect(nextLesson('no-such-lesson')).toBeNull();
  });
});

describe('lesson progress storage', () => {
  it('round-trips through localStorage under parrotype:lessons', () => {
    const progress = recordAttempt({}, third!, { wpm: 40, accuracy: 99 });
    expect(saveProgress(progress)).toBe(true);
    expect(JSON.parse(localStorage.getItem(LESSONS_STORAGE_KEY) ?? 'null')).toEqual(progress);
    expect(loadProgress()).toEqual(progress);
  });

  it('starts empty when the stored value is not JSON', () => {
    localStorage.setItem(LESSONS_STORAGE_KEY, '{not json');
    expect(loadProgress()).toEqual({});
  });

  it('drops records that are malformed, out of range or for unknown lessons', () => {
    const parsed = parseProgress({
      [first!.id]: { passed: true, bestWpm: 30, bestAcc: 99 },
      [second!.id]: { passed: 'yes', bestWpm: 30, bestAcc: 99 },
      [third!.id]: { passed: true, bestWpm: -4, bestAcc: 99 },
      'removed-lesson': { passed: true, bestWpm: 30, bestAcc: 99 },
      [LESSONS[3]!.id]: null,
      [LESSONS[4]!.id]: { passed: false, bestWpm: 10, bestAcc: 101 },
    });
    expect(Object.keys(parsed)).toEqual([first!.id]);
  });

  it('treats a non-object root as empty', () => {
    expect(parseProgress([1, 2])).toEqual({});
    expect(parseProgress('x')).toEqual({});
    expect(parseProgress(null)).toEqual({});
  });

  it('keeps working when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage;
    expect(loadProgress(broken)).toEqual({});
    expect(saveProgress({}, broken)).toBe(false);
  });
});
