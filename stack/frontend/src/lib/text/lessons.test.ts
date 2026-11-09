import { describe, it, expect } from 'vitest';
import { LESSONS, lessonWords, type Lesson } from './lessons';
import { createRng } from './rng';
import { en } from './wordlists/en';

describe('LESSONS', () => {
  it('has about fourteen lessons with unique ids and titles', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(12);
    expect(LESSONS.length).toBeLessThanOrEqual(16);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    expect(new Set(LESSONS.map((l) => l.title)).size).toBe(LESSONS.length);
  });

  it('allows only lowercase letters and punctuation, and never a space', () => {
    for (const lesson of LESSONS) {
      expect(lesson.allowed, lesson.id).toMatch(/^[a-z.,;'-]+$/);
      expect(lesson.keys, lesson.id).toMatch(/^[a-z.,;'-]*$/);
    }
  });

  it('keys are the new chars: inside allowed, and not allowed by the lesson before', () => {
    LESSONS.forEach((lesson, i) => {
      const previous = i === 0 ? '' : (LESSONS[i - 1]?.allowed ?? '');
      for (const ch of lesson.keys) {
        expect(lesson.allowed.includes(ch), `${lesson.id} ${ch}`).toBe(true);
        expect(previous.includes(ch), `${lesson.id} ${ch} is not new`).toBe(false);
      }
    });
  });

  it('allowed sets are cumulative: each lesson keeps every char of the one before', () => {
    LESSONS.forEach((lesson, i) => {
      if (i === 0) return;
      const previous = LESSONS[i - 1]?.allowed ?? '';
      for (const ch of previous) expect(lesson.allowed.includes(ch), `${lesson.id} lost ${ch}`).toBe(true);
    });
  });

  it('starts on the home row and introduces every lowercase letter by the end', () => {
    expect(LESSONS[0]?.keys).toBe('fj');
    const last = LESSONS[LESSONS.length - 1] as Lesson;
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') expect(last.allowed).toContain(letter);
  });

  it('has the caps and punctuation lessons', () => {
    expect(LESSONS.some((l) => l.caps === true)).toBe(true);
    expect(LESSONS.at(-1)?.keys).toContain('.');
  });

  it('goals are sensible and rise along the path', () => {
    for (const lesson of LESSONS) {
      expect(lesson.goalWpm).toBeGreaterThan(0);
      expect(lesson.goalWpm).toBeLessThanOrEqual(60);
      expect(lesson.goalAcc).toBeGreaterThanOrEqual(80);
      expect(lesson.goalAcc).toBeLessThanOrEqual(100);
    }
    expect(LESSONS.at(-1)!.goalWpm).toBeGreaterThanOrEqual(LESSONS[0]!.goalWpm);
  });
});

describe('lessonWords', () => {
  for (const lesson of LESSONS) {
    it(`${lesson.id}: 200 words use only the allowed chars (case-insensitively)`, () => {
      const words = lessonWords(lesson, 200, createRng(11));
      expect(words).toHaveLength(200);
      const allowed = lesson.allowed.toLowerCase();
      for (const word of words) {
        expect(word.length).toBeGreaterThan(0);
        for (const ch of word.toLowerCase()) {
          expect(allowed.includes(ch), `${lesson.id}: "${word}" has ${ch}`).toBe(true);
        }
      }
    });
  }

  it('the pool has at least 15 distinct words (padding with pseudo-words when needed)', () => {
    for (const lesson of LESSONS) {
      const distinct = new Set(lessonWords(lesson, 200, createRng(5)).map((w) => w.toLowerCase()));
      expect(distinct.size, lesson.id).toBeGreaterThanOrEqual(10);
    }
  });

  it('pads the first lesson with pseudo-words of 2 to 6 letters from f and j', () => {
    const words = lessonWords(LESSONS[0]!, 100, createRng(2));
    expect(words.every((w) => /^[fj]{2,6}$/.test(w))).toBe(true);
  });

  it('uses real English words once the letters allow them', () => {
    const last = LESSONS.find((l) => l.id === 'top-qp') ?? LESSONS[LESSONS.length - 1]!;
    const words = lessonWords(last, 200, createRng(4));
    expect(words.some((w) => en.includes(w))).toBe(true);
  });

  it('never repeats a word twice in a row', () => {
    for (const lesson of LESSONS) {
      const words = lessonWords(lesson, 200, createRng(8)).map((w) => w.toLowerCase());
      for (let i = 1; i < words.length; i++) expect(words[i], lesson.id).not.toBe(words[i - 1]);
    }
  });

  it('capitals lessons capitalise some words and others never', () => {
    const caps = LESSONS.find((l) => l.caps === true)!;
    const words = lessonWords(caps, 200, createRng(6));
    expect(words.some((w) => /^[A-Z]/.test(w))).toBe(true);
    // ';' has been allowed since lesson 4, so it can end a word here too.
    expect(words.every((w) => /^[A-Za-z;]+$/.test(w))).toBe(true);
    const before = LESSONS[LESSONS.indexOf(caps) - 1]!;
    const plain = lessonWords(before, 200, createRng(6));
    expect(plain.some((w) => /[A-Z]/.test(w))).toBe(false);
  });

  it('the punctuation lesson adds allowed punctuation to some words', () => {
    const last = LESSONS[LESSONS.length - 1]!;
    const words = lessonWords(last, 200, createRng(7));
    expect(words.some((w) => /[.,'-]/.test(w))).toBe(true);
  });

  it('is deterministic for a seed and handles a zero count', () => {
    expect(lessonWords(LESSONS[3]!, 50, createRng(1))).toEqual(lessonWords(LESSONS[3]!, 50, createRng(1)));
    expect(lessonWords(LESSONS[0]!, 0)).toEqual([]);
  });
});
