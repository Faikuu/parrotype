import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Language, Mode, TestConfig } from '@/lib/engine/types';
import { safeStorage } from './storage';

/** Wpm values kept for the running average. */
export const RECENT_COUNT = 10;
/** Most recent dates kept per (language, flags) for daily bests. */
export const DAILY_KEEP_DATES = 7;
/** Most keys kept in total. The oldest (by `at`) are dropped first. */
export const MAX_BEST_KEYS = 300;

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
  /** Forgets all local bests and the recent list, and removes the stored entry. */
  clear: () => void;
}

/**
 * The key a best is kept under: mode, mode2 (time, words, quote length, pangram count, date, ...),
 * language and the punctuation and numbers flags. Two tests share a best only when they are the same test.
 *
 * Daily text is always punctuated and never has numbers, so a daily key ignores the user's flags and
 * always uses punctuation on and numbers off.
 */
export function bestKey(cfg: Pick<TestConfig, 'language' | 'punctuation' | 'numbers' | 'mode'>, mode2: string): string {
  const mode: Mode = cfg.mode;
  const lang: Language = cfg.language;
  const daily = mode === 'daily';
  const punctuation = daily ? true : cfg.punctuation;
  const numbers = daily ? false : cfg.numbers;
  return [mode, mode2, lang, punctuation ? '1' : '0', numbers ? '1' : '0'].join('|');
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

/**
 * Whether the account's best for this mode, mode2 and language can be compared with a run. The server
 * does not store the punctuation and numbers flags, so its best only means the same thing when the text
 * cannot change with them: quote (API text), zen (no text), custom (the user's text), weak (letter words),
 * daily (always punctuated, no numbers). Time, words and pangram text does change with the flags, so
 * those are only compared when both flags are off.
 */
export function serverBestComparable(cfg: Pick<TestConfig, 'mode' | 'punctuation' | 'numbers'>): boolean {
  switch (cfg.mode) {
    case 'quote':
    case 'zen':
    case 'custom':
    case 'weak':
    case 'daily':
      return true;
    case 'time':
    case 'words':
    case 'pangram':
      return !cfg.punctuation && !cfg.numbers;
  }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Caps the stored bests: keeps only the latest DAILY_KEEP_DATES dates per (language, flags) among daily
 * keys, then keeps at most MAX_BEST_KEYS keys, dropping the oldest by `at`. Returns the input when nothing
 * is dropped.
 */
export function pruneBests(bests: LocalBestMap): LocalBestMap {
  const dropped = new Set<string>();

  // Daily keys are `daily|<date>|<language>|<punctuation>|<numbers>`.
  const byGroup = new Map<string, string[]>();
  for (const key of Object.keys(bests)) {
    const parts = key.split('|');
    if (parts[0] !== 'daily') continue;
    const group = parts.slice(2).join('|');
    byGroup.set(group, [...(byGroup.get(group) ?? []), key]);
  }
  for (const keys of byGroup.values()) {
    const newestFirst = keys.sort((a, b) => (a.split('|')[1]! < b.split('|')[1]! ? 1 : -1));
    for (const key of newestFirst.slice(DAILY_KEEP_DATES)) dropped.add(key);
  }

  const remaining = Object.keys(bests).filter((key) => !dropped.has(key));
  if (remaining.length > MAX_BEST_KEYS) {
    const oldestFirst = remaining.sort((a, b) => bests[a]!.at - bests[b]!.at);
    for (const key of oldestFirst.slice(0, remaining.length - MAX_BEST_KEYS)) dropped.add(key);
  }

  if (dropped.size === 0) return bests;
  const out: LocalBestMap = {};
  for (const [key, value] of Object.entries(bests)) {
    if (!dropped.has(key)) out[key] = value;
  }
  return out;
}

/** Keeps only well-formed entries, prunes the bests and trims the recent list. */
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
  out.bests = pruneBests(out.bests);
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
        const merged = prev && prev.wpm >= result.wpm ? bests : { ...bests, [key]: { wpm: result.wpm, accuracy: result.accuracy, at } };
        set({
          bests: pruneBests(merged),
          recentWpm: [...recentWpm, result.wpm].slice(-RECENT_COUNT),
        });
      },
      clear: () => {
        set({ bests: {}, recentWpm: [] });
        try {
          // The store writes itself after each change, so the stored entry is removed after the reset.
          useLocalBests.persist.clearStorage();
        } catch {
          // storage unavailable: nothing stored to remove
        }
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
