import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mergeBigrams, type BigramStats } from '@/lib/engine/bigrams';
import type { Language } from '@/lib/engine/types';
import { safeStorage } from './storage';

/** Share of old data kept each time a test is merged (same convention as the key stats). */
const DECAY = 0.9;

export type BigramsByLanguage = Partial<Record<Language, BigramStats>>;

const LANGS: readonly Language[] = ['en', 'pl', 'de', 'es'];

/** Keeps only per-language maps of valid pairs, so corrupt storage can't break the app. */
export function sanitizeBigrams(input: unknown): { byLanguage: BigramsByLanguage } {
  const byLanguage: BigramsByLanguage = {};
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>).byLanguage : undefined;
  if (!src || typeof src !== 'object') return { byLanguage };
  for (const lang of LANGS) {
    const map = (src as Record<string, unknown>)[lang];
    if (!map || typeof map !== 'object') continue;
    const clean: BigramStats = {};
    for (const [pair, stat] of Object.entries(map as Record<string, unknown>)) {
      if (pair.length !== 2 || !stat || typeof stat !== 'object') continue;
      const { total, count } = stat as Record<string, unknown>;
      if (typeof total === 'number' && typeof count === 'number' && Number.isFinite(total) && Number.isFinite(count) && count > 0) {
        clean[pair] = { total, count };
      }
    }
    if (Object.keys(clean).length > 0) byLanguage[lang] = clean;
  }
  return { byLanguage };
}

export interface BigramStatsState {
  byLanguage: BigramsByLanguage;
  /** Folds one finished test's pair delays into the running totals for `language`. */
  record: (latest: BigramStats, language: Language) => void;
  clear: () => void;
}

/** Slowest letter pairs accumulated over tests, per language. Stored locally only. */
export const useBigramStats = create<BigramStatsState>()(
  persist(
    (set, get) => ({
      byLanguage: {},
      record: (latest, language) => {
        if (Object.keys(latest).length === 0) return;
        const merged = mergeBigrams(get().byLanguage[language] ?? {}, latest, DECAY);
        set({ byLanguage: { ...get().byLanguage, [language]: merged } });
      },
      clear: () => {
        set({ byLanguage: {} });
        try {
          useBigramStats.persist.clearStorage();
        } catch {
          // storage unavailable: nothing stored to remove
        }
      },
    }),
    {
      name: 'parrotype:bigrams',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ byLanguage: s.byLanguage }) as BigramStatsState,
      merge: (persisted, current) => ({ ...current, ...sanitizeBigrams(persisted) }),
    },
  ),
);
