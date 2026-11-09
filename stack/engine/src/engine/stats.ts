import { getCharStates, isWordCorrect } from './engine';
import { computeKeyStats } from './keystats';
import type { EngineState, SecondSample, TestResult } from './types';

export type CharStats = TestResult['charStats'];

/** Rounds to 2 decimals. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Counts character states across every word the user has started. Pending chars are not counted. */
export function countChars(state: EngineState): CharStats {
  const counts: CharStats = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
  for (let i = 0; i < state.typed.length; i++) {
    for (const { state: s } of getCharStates(state, i)) {
      if (s === 'correct') counts.correct++;
      else if (s === 'incorrect') counts.incorrect++;
      else if (s === 'extra') counts.extra++;
      else if (s === 'missed') counts.missed++;
    }
  }
  return counts;
}

/** Test duration: start to finish, or to the last keystroke if the test is not finished. */
export function durationOf(state: EngineState): number {
  if (state.startedAt === null) return 0;
  const end = state.finishedAt ?? state.keystrokes[state.keystrokes.length - 1]?.at ?? state.startedAt;
  return Math.max(0, Math.round(end - state.startedAt));
}

/** 100 * (1 - coefficient of variation) of the samples' raw wpm, clamped to 0..100. */
export function consistencyOf(samples: readonly SecondSample[]): number {
  if (samples.length < 2) return 100;
  const values = samples.map((s) => s.raw);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  // Zero mean means nothing was typed, so there is no variation to measure.
  if (mean === 0) return 100;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.min(100, Math.max(0, 100 * (1 - cv)));
}

export function computeResult(state: EngineState): TestResult {
  const durationMs = durationOf(state);
  const minutes = durationMs / 60000;
  const lastIdx = state.typed.length - 1;

  // wpm: chars of correctly typed words, plus a space between each counted word.
  // The last typed word counts when it is a correct prefix of its target.
  let netChars = 0;
  let countedWords = 0;
  let allChars = 0;
  for (let i = 0; i <= lastIdx; i++) {
    const typedWord = state.typed[i] ?? '';
    allChars += typedWord.length;
    if (isWordCorrect(state, i)) {
      netChars += typedWord.length;
      countedWords++;
    } else if (i === lastIdx && typedWord.length > 0) {
      const target = state.words[i] ?? '';
      if (target.startsWith(typedWord)) {
        netChars += typedWord.length;
        countedWords++;
      }
    }
  }
  const spacesCounted = Math.max(0, countedWords - 1);
  // Raw counts every typed char plus every word separator.
  const spacesTyped = Math.max(0, lastIdx);

  const correctKeys = state.keystrokes.filter((k) => k.correct).length;
  const totalKeys = state.keystrokes.length;

  const perMinute = (chars: number): number => (minutes > 0 ? chars / 5 / minutes : 0);

  return {
    failed: state.failed,
    wpm: round2(perMinute(netChars + spacesCounted)),
    rawWpm: round2(perMinute(allChars + spacesTyped)),
    accuracy: totalKeys === 0 ? 100 : round2((correctKeys / totalKeys) * 100),
    consistency: round2(consistencyOf(state.samples)),
    durationMs,
    charStats: countChars(state),
    samples: state.samples,
    keyStats: computeKeyStats(state),
  };
}
