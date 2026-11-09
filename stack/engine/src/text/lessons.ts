import { en } from './wordlists/en';
import type { Rng } from './rng';

/** One step of the Learn path. Keys are introduced a few at a time, and each lesson keeps the earlier ones. */
export interface Lesson {
  id: string;
  title: string;
  /** The new keys, one char each. Empty when the lesson adds none (capitals). */
  keys: string;
  /** Every char the lesson's text may use: the cumulative keys, lowercase letters and punctuation. */
  allowed: string;
  goalWpm: number;
  goalAcc: number;
  /** Words start with a capital letter, about one in three. */
  caps?: boolean;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
/** Distinct words a lesson's text draws from; fewer real words are padded with pseudo-words. */
const MIN_POOL = 15;

export const LESSONS: Lesson[] = [
  { id: 'home-fj', title: 'Home row: f and j', keys: 'fj', allowed: 'fj', goalWpm: 12, goalAcc: 90 },
  { id: 'home-dk', title: 'Home row: d and k', keys: 'dk', allowed: 'fjdk', goalWpm: 14, goalAcc: 90 },
  { id: 'home-sl', title: 'Home row: s and l', keys: 'sl', allowed: 'fjdksl', goalWpm: 16, goalAcc: 90 },
  { id: 'home-a-semi', title: 'Home row: a and ;', keys: 'a;', allowed: 'fjdksla;', goalWpm: 18, goalAcc: 90 },
  { id: 'reach-ei', title: 'Upper row: e and i', keys: 'ei', allowed: 'fjdksla;ei', goalWpm: 20, goalAcc: 92 },
  { id: 'reach-ru', title: 'Upper row: r and u', keys: 'ru', allowed: 'fjdksla;eiru', goalWpm: 22, goalAcc: 92 },
  { id: 'centre-gh', title: 'Centre: g and h', keys: 'gh', allowed: 'fjdksla;eirugh', goalWpm: 24, goalAcc: 93 },
  { id: 'reach-ty', title: 'Upper row: t and y', keys: 'ty', allowed: 'fjdksla;eirughty', goalWpm: 26, goalAcc: 93 },
  { id: 'bottom-cmvn', title: 'Bottom row: c, m, v and n', keys: 'cmvn', allowed: 'fjdksla;eirughtycmvn', goalWpm: 28, goalAcc: 94 },
  { id: 'bottom-xzb', title: 'Bottom row: x, z and b', keys: 'xzb', allowed: 'fjdksla;eirughtycmvnxzb', goalWpm: 30, goalAcc: 94 },
  { id: 'top-wo', title: 'Top row: w and o', keys: 'wo', allowed: 'fjdksla;eirughtycmvnxzbwo', goalWpm: 30, goalAcc: 95 },
  { id: 'top-qp', title: 'Top row: q and p', keys: 'qp', allowed: 'fjdksla;eirughtycmvnxzbwoqp', goalWpm: 32, goalAcc: 95 },
  {
    id: 'capitals',
    title: 'Capital letters with Shift',
    keys: '',
    allowed: 'fjdksla;eirughtycmvnxzbwoqp',
    goalWpm: 32,
    goalAcc: 95,
    caps: true,
  },
  {
    id: 'punctuation',
    title: 'Punctuation and real words',
    keys: '.,\'-',
    allowed: 'fjdksla;eirughtycmvnxzbwoqp.,\'-',
    goalWpm: 35,
    goalAcc: 95,
  },
];

/** The English words that use only the allowed letters, distinct, in list order. */
function realWords(letters: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of en) {
    if (seen.has(word)) continue;
    seen.add(word);
    if ([...word].every((ch) => letters.includes(ch))) out.push(word);
  }
  return out;
}

/** An alternating consonant/vowel pseudo-word of 2-6 letters from `letters` (any letter when one class is missing). */
function pseudoWord(letters: string, vowels: string, consonants: string, rng: Rng): string {
  const length = 2 + Math.floor(rng() * 5);
  const alternate = vowels.length > 0 && consonants.length > 0;
  let vowelNext = rng() < 0.5;
  let word = '';
  for (let i = 0; i < length; i++) {
    const pool = alternate ? (vowelNext ? vowels : consonants) : letters;
    word += pool.charAt(Math.floor(rng() * pool.length));
    vowelNext = !vowelNext;
  }
  return word;
}

/**
 * `count` words for a lesson. They are real English words that use only the lesson's letters; when there are
 * fewer than 15 such words, pseudo-words built from the allowed letters pad the pool. Words never repeat
 * twice in a row. Caps lessons capitalise about a third of the words, and lessons that allow punctuation
 * add an allowed mark to about one word in six. Nothing outside `allowed` is ever used.
 */
export function lessonWords(lesson: Lesson, count = 30, rng: Rng = Math.random): string[] {
  if (count <= 0) return [];
  const letters = [...new Set([...lesson.allowed].filter((ch) => LETTERS.includes(ch)))].join('');
  const marks = [...new Set([...lesson.allowed].filter((ch) => !LETTERS.includes(ch)))];
  const vowels = [...letters].filter((ch) => 'aeiou'.includes(ch)).join('');
  const consonants = [...letters].filter((ch) => !'aeiou'.includes(ch)).join('');

  const pool = realWords(letters);
  const seen = new Set(pool);
  for (let attempts = 0; pool.length < MIN_POOL && attempts < 100_000; attempts++) {
    const word = pseudoWord(letters, vowels, consonants, rng);
    if (seen.has(word)) continue;
    seen.add(word);
    pool.push(word);
  }

  const out: string[] = [];
  let prev = -1;
  for (let n = 0; n < count; n++) {
    let index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    if (pool.length > 1) {
      while (index === prev) index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    }
    prev = index;
    let word = pool[index] ?? '';
    if (lesson.caps && rng() < 1 / 3) word = word.charAt(0).toUpperCase() + word.slice(1);
    if (marks.length > 0 && rng() < 1 / 6) word += marks[Math.floor(rng() * marks.length)] ?? '';
    out.push(word);
  }
  return out;
}
