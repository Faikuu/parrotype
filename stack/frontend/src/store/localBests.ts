import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Language, Mode, TestConfig } from '@/lib/engine/types';
import { safeStorage } from './storage';

/** Wpm values kept for the running average. */
export const RECENT_COUNT = 10;

export interface LocalBest {
  wpm: number;
  accuracy: number;
  at: number;
}

/** Best per config key (see bestKey). */
export type LocalBestMap = Record<string, LocalBest>;

export interface LocalBestsState {
  bests: LocalBestMap;
  /** Most recent wpm values, newest last, at most RECENT_COUNT. */
  recentWpm: number[];
  /** Stores a finished test: updates the best for its key (if it beats it) and the recent list. */
  record: (key: string, result: { wpm: number; accuracy: number }, at?: number) => void;
}

/**
 * The key a best is kept under: mode, mode2 (time, words, quote length, pangram count, date, ...),
 * language and the punctuation and numbers flags. Two tests share a best only when they are the same test.
 */
export function bestKey(cfg: Pick<TestConfig, 'language' | 'punctuation' | 'numbers' | 'mode'>, mode2: string): string {
  const mode: Mode = cfg.mode;
  const lang: Language = cfg.language;
  return [mode, mode2, lang, cfg.punctuation ? '1' : '0', cfg.numbers ? '1' : '0'].join('|');
}

/** Mean of the recent wpm values, rounded to 2 decimals, or null when there are none. */
export function averageOf(recent: readonly number[]): number | null {
  if (recent.length === 0) return null;
  const sum = recent.reduce((a, b) => a + b, 0);
  return Math.round((sum / recent.length) * 100) / 100;
}

/**
 * Whether a finished run beats the previous best. `previous` is the local best and `server` the best
 * from the account summary (same mode, mode2 and language), if it is in the cache. A run is a personal
 * best only when there was something to beat.
 */
export function isPersonalBest(wpm: number, previous: number | undefined, server?: number): boolean {
  const prior = Math.max(previous ?? -Infinity, server ?? -Infinity);
  return prior !== -Infinity && wpm > prior;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Keeps only well-formed entries and trims the recent list. */
export function sanitizeBests(input: unknown): { bests: LocalBestMap; recentWpm: number[] } {
  const out = { bests: {} as LocalBestMap, recentWpm: [] as number[] };
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  if (src.bests && typeof src.bests === 'object') {
    for (const [key, value] of Object.entries(src.bests as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      if (isNum(v.wpm) && isNum(v.accuracy) && isNum(v.at)) {
        out.bests[key] = { wpm: v.wpm, accuracy: v.accuracy, at: v.at };
      }
    }
  }
  if (Array.isArray(src.recentWpm)) {
    out.recentWpm = src.recentWpm.filter(isNum).slice(-RECENT_COUNT);
  }
  return out;
}

export const useLocalBests = create<LocalBestsState>()(
  persist(
    (set, get) => ({
      bests: {},
      recentWpm: [],
      record: (key, result, at = Date.now()) => {
        const { bests, recentWpm } = get();
        const prev = bests[key];
        const nextBests = prev && prev.wpm >= result.wpm ? bests : { ...bests, [key]: { wpm: result.wpm, accuracy: result.accuracy, at } };
        set({
          bests: nextBests,
          recentWpm: [...recentWpm, result.wpm].slice(-RECENT_COUNT),
        });
      },
    }),
    {
      name: 'parrotype:bests',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ bests: s.bests, recentWpm: s.recentWpm }) as LocalBestsState,
      merge: (persisted, current) => ({ ...current, ...sanitizeBests(persisted) }),
    },
  ),
);
