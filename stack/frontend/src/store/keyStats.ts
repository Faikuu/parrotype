import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ALPHABETS } from '@/lib/text/pangram';
import type { Language } from '@/lib/engine/types';
import { mergeKeyStats, weakestKeys, type KeyStat, type KeyStatsMap } from '@/lib/engine/keystats';
import { safeStorage } from './storage';

/** Share of old data kept each time a test is merged (see mergeKeyStats). */
const DECAY = 0.9;
/** Most letters named as weak. */
const WEAK_COUNT = 5;

/** Spanish accented vowels count as their base letter (the alphabet for pangrams works the same way). */
const ES_FOLD: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };

/** Folds accented Spanish vowels into their base letter. Other languages come back unchanged. */
export function foldKeyStats(stats: KeyStatsMap, language: Language): KeyStatsMap {
  if (language !== 'es') return stats;
  const out: KeyStatsMap = {};
  for (const [key, stat] of Object.entries(stats)) {
    const folded = ES_FOLD[key] ?? key;
    const prev = out[folded] ?? { hits: 0, misses: 0 };
    out[folded] = { hits: prev.hits + stat.hits, misses: prev.misses + stat.misses };
  }
  return out;
}

/** Letters to practise: the worst letters of the language that have at least one miss. */
export function weakLetters(stats: KeyStatsMap | undefined, language: Language): string[] {
  const ranked = weakestKeys(stats ?? {}, ALPHABETS[language], WEAK_COUNT);
  return ranked.filter((letter) => (stats?.[letter]?.misses ?? 0) >= 1);
}

export type KeyStatsByLanguage = Partial<Record<Language, KeyStatsMap>>;

const LANGS: readonly Language[] = ['en', 'pl', 'de', 'es'];

function isStat(value: unknown): value is KeyStat {
  if (!value || typeof value !== 'object') return false;
  const { hits, misses } = value as Record<string, unknown>;
  return typeof hits === 'number' && typeof misses === 'number' && Number.isFinite(hits) && Number.isFinite(misses) && hits >= 0 && misses >= 0;
}

function sanitizeMap(value: unknown): KeyStatsMap {
  const out: KeyStatsMap = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, stat] of Object.entries(value as Record<string, unknown>)) {
    if (key.length <= 4 && isStat(stat)) out[key] = { hits: stat.hits, misses: stat.misses };
  }
  return out;
}

/** Keeps only valid per-language maps, so corrupt storage can't break the app. */
export function sanitizeKeyStats(input: unknown): { byLanguage: KeyStatsByLanguage } {
  const byLanguage: KeyStatsByLanguage = {};
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>).byLanguage : undefined;
  if (src && typeof src === 'object') {
    for (const lang of LANGS) {
      const map = sanitizeMap((src as Record<string, unknown>)[lang]);
      if (Object.keys(map).length > 0) byLanguage[lang] = map;
    }
  }
  return { byLanguage };
}

export interface KeyStatsState {
  byLanguage: KeyStatsByLanguage;
  /** Merges one finished test's key stats into the running totals for `language`. */
  record: (latest: KeyStatsMap, language: Language) => void;
  /** Forgets all key stats and removes the stored entry. */
  clear: () => void;
}

export const useKeyStats = create<KeyStatsState>()(
  persist(
    (set, get) => ({
      byLanguage: {},
      record: (latest, language) => {
        const folded = foldKeyStats(latest, language);
        // A test with no letters (zen, custom symbols) says nothing about keys, and must not decay the totals.
        if (Object.keys(folded).length === 0) return;
        const merged = mergeKeyStats(get().byLanguage[language] ?? {}, folded, DECAY);
        set({ byLanguage: { ...get().byLanguage, [language]: merged } });
      },
      clear: () => {
        set({ byLanguage: {} });
        try {
          // The store writes itself after each change, so the stored entry is removed after the reset.
          useKeyStats.persist.clearStorage();
        } catch {
          // storage unavailable: nothing stored to remove
        }
      },
    }),
    {
      name: 'parrotype:keystats',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ byLanguage: s.byLanguage }) as KeyStatsState,
      merge: (persisted, current) => ({ ...current, ...sanitizeKeyStats(persisted) }),
    },
  ),
);
