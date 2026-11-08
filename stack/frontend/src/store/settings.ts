import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { TestConfig } from '@/lib/engine/types';
import { DEFAULT_THEME, FONT_IDS, THEME_IDS, type FontId, type ThemeId } from '@/themes/themes';

export type FontSize = 1 | 1.25 | 1.5 | 2 | 2.5 | 3;
export type CaretStyle = 'line' | 'block' | 'underline' | 'off';
export type LiveStats = 'wpm' | 'acc' | 'both' | 'off';
export type QuickRestart = 'tab' | 'esc' | 'off';
export type UiLanguage = 'en' | 'pl';

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
};

const DATA_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof SettingsData)[];

/** Allowed values for enum-like keys; anything else from storage falls back to the default. */
const ALLOWED: Partial<Record<keyof SettingsData, readonly unknown[]>> = {
  mode: ['time', 'words', 'quote', 'zen', 'pangram', 'custom'],
  time: [15, 30, 60, 120],
  words: [10, 25, 50, 100],
  quoteLength: ['short', 'medium', 'long', 'any'],
  pangramCount: [1, 3, 5],
  language: ['en', 'pl'],
  stopOnError: ['off', 'letter', 'word'],
  theme: THEME_IDS,
  font: FONT_IDS,
  fontSize: [1, 1.25, 1.5, 2, 2.5, 3],
  caretStyle: ['line', 'block', 'underline', 'off'],
  liveStats: ['wpm', 'acc', 'both', 'off'],
  quickRestart: ['tab', 'esc', 'off'],
  uiLanguage: ['en', 'pl'],
};

/** Keeps only known keys with the right type, so stale or corrupt storage can't break the app. */
function sanitize(input: unknown): SettingsData {
  const out: SettingsData = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  for (const key of DATA_KEYS) {
    const value = src[key];
    if (value === undefined || typeof value !== typeof DEFAULT_SETTINGS[key]) continue;
    const allowed = ALLOWED[key];
    if (allowed && !allowed.includes(value)) continue;
    (out as unknown as Record<string, unknown>)[key] = value;
  }
  return out;
}

const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // storage unavailable (private mode, blocked): settings just won't persist
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

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
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persisted) => sanitize(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
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
  };
}
