import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { TestConfig } from '@/lib/engine/types';
import { DEFAULT_THEME, FONT_IDS, THEME_IDS, type FontId, type ThemeId } from '@/themes/themes';
import { safeStorage } from './storage';

export type FontSize = 1 | 1.25 | 1.5 | 2 | 2.5 | 3;
export type CaretStyle = 'line' | 'block' | 'underline' | 'off';
export type LiveStats = 'wpm' | 'acc' | 'both' | 'off';
export type QuickRestart = 'tab' | 'esc' | 'off';
export type UiLanguage = 'en' | 'pl';
export type PaceCaret = 'off' | 'pb' | 'average' | 'custom';
export type SoundProfile = 'off' | 'click' | 'soft' | 'typewriter';

export interface SettingsData extends TestConfig {
  theme: ThemeId;
  font: FontId;
  fontSize: FontSize; // rem multiplier for the test text
  caretStyle: CaretStyle;
  smoothCaret: boolean;
  liveStats: LiveStats;
  blindMode: boolean;
  focusMode: boolean; // hides chrome while typing
  quickRestart: QuickRestart;
  uiLanguage: UiLanguage;
  paceCaret: PaceCaret; // a second caret moving at this speed: off, your best, your average, or paceWpm
  paceWpm: number; // 10–300
  tapeMode: boolean; // one scrolling line instead of three
  sound: SoundProfile;
  soundVolume: number; // 0–1
}

export interface Settings extends SettingsData {
  set: <K extends keyof SettingsData>(k: K, v: SettingsData[K]) => void;
  setMany: (p: Partial<SettingsData>) => void;
  reset: () => void;
}

function detectUiLanguage(): UiLanguage {
  try {
    return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pl')
      ? 'pl'
      : 'en';
  } catch {
    return 'en';
  }
}

export const DEFAULT_SETTINGS: SettingsData = {
  mode: 'time',
  time: 30,
  words: 25,
  quoteLength: 'any',
  pangramCount: 1,
  punctuation: false,
  numbers: false,
  language: 'en',
  customText: '',
  stopOnError: 'off',
  noBackspace: false,
  suddenDeath: false,
  theme: DEFAULT_THEME,
  font: 'spline',
  fontSize: 1,
  caretStyle: 'line',
  smoothCaret: true,
  liveStats: 'wpm',
  blindMode: false,
  focusMode: true,
  quickRestart: 'tab',
  uiLanguage: detectUiLanguage(),
  paceCaret: 'off',
  paceWpm: 60,
  tapeMode: false,
  sound: 'off',
  soundVolume: 0.5,
};

const DATA_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof SettingsData)[];

/** Longest custom text the modal accepts (characters, as the textarea counts them). */
export const CUSTOM_TEXT_MAX = 10000;

/** Allowed values for enum-like keys; anything else from storage falls back to the default. */
const ALLOWED: Partial<Record<keyof SettingsData, readonly unknown[]>> = {
  mode: ['time', 'words', 'quote', 'zen', 'pangram', 'custom', 'daily', 'weak'],
  time: [15, 30, 60, 120],
  words: [10, 25, 50, 100],
  quoteLength: ['short', 'medium', 'long', 'any'],
  pangramCount: [1, 3, 5],
  language: ['en', 'pl', 'de', 'es'],
  stopOnError: ['off', 'letter', 'word'],
  theme: THEME_IDS,
  font: FONT_IDS,
  fontSize: [1, 1.25, 1.5, 2, 2.5, 3],
  caretStyle: ['line', 'block', 'underline', 'off'],
  liveStats: ['wpm', 'acc', 'both', 'off'],
  quickRestart: ['tab', 'esc', 'off'],
  uiLanguage: ['en', 'pl'],
  paceCaret: ['off', 'pb', 'average', 'custom'],
  sound: ['off', 'click', 'soft', 'typewriter'],
};

/** Numeric keys and their allowed range. */
const RANGE: Partial<Record<keyof SettingsData, readonly [number, number]>> = {
  paceWpm: [10, 300],
  soundVolume: [0, 1],
};

/**
 * Keeps only known keys with the right type, clamped to range where there is one, so stale or corrupt
 * storage can't break the app. This is also the migration from every older persisted version: values
 * that are still valid are kept, and keys that are new take their defaults.
 */
export function sanitizeSettings(input: unknown): SettingsData {
  const out: SettingsData = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  for (const key of DATA_KEYS) {
    const value = src[key];
    if (value === undefined || typeof value !== typeof DEFAULT_SETTINGS[key]) continue;
    const allowed = ALLOWED[key];
    if (allowed && !allowed.includes(value)) continue;
    const range = RANGE[key];
    if (range) {
      const n = value as number;
      if (!Number.isFinite(n)) continue;
      (out as unknown as Record<string, unknown>)[key] = Math.min(range[1], Math.max(range[0], n));
      continue;
    }
    // Stored custom text can be longer than the modal allows (older versions, hand-edited storage).
    const clean = key === 'customText' ? (value as string).slice(0, CUSTOM_TEXT_MAX) : value;
    (out as unknown as Record<string, unknown>)[key] = clean;
  }
  return out;
}

/** Settings schema version. 1: the 2.0 keys. 2: pace caret, tape mode, sound, daily/weak, de/es. */
export const SETTINGS_VERSION = 2;

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (k, v) => set({ [k]: v } as Partial<SettingsData>),
      setMany: (p) => set(p),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'parrotype:settings',
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => safeStorage),
      // Every older version goes through sanitize, which keeps the values they stored.
      migrate: (persisted) => sanitizeSettings(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
      partialize: (s) => {
        const data: Partial<SettingsData> = {};
        for (const key of DATA_KEYS) {
          (data as Record<string, unknown>)[key] = s[key];
        }
        return data as SettingsData;
      },
    },
  ),
);

export function selectTestConfig(s: SettingsData): TestConfig {
  return {
    mode: s.mode,
    time: s.time,
    words: s.words,
    quoteLength: s.quoteLength,
    pangramCount: s.pangramCount,
    punctuation: s.punctuation,
    numbers: s.numbers,
    language: s.language,
    customText: s.customText,
    stopOnError: s.stopOnError,
    noBackspace: s.noBackspace,
    suddenDeath: s.suddenDeath,
  };
}
