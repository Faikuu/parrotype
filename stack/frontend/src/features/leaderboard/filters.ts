import { BOARD_LANGUAGES, type BoardLanguage } from '@/features/account/labels';

export const TIME_OPTIONS = [15, 30, 60, 120] as const;
export const WORDS_OPTIONS = [10, 25, 50, 100] as const;
export const DAY_OPTIONS = ['today', 'yesterday'] as const;
export type DayOption = (typeof DAY_OPTIONS)[number];
export type BoardMode = 'time' | 'words' | 'daily';

export interface BoardFilters {
  mode: BoardMode;
  /** time: "15"|"30"|"60"|"120"; words: "10"|"25"|"50"|"100"; daily: "today"|"yesterday". */
  mode2: string;
  language: BoardLanguage;
}

const DEFAULT_OPTION: Record<BoardMode, string> = { time: '60', words: '25', daily: 'today' };

function optionsFor(mode: BoardMode): readonly string[] {
  if (mode === 'daily') return DAY_OPTIONS;
  if (mode === 'words') return WORDS_OPTIONS.map(String);
  return TIME_OPTIONS.map(String);
}

/** Reads the filters from the URL, falling back to defaults for anything unknown. */
export function parseFilters(params: URLSearchParams): BoardFilters {
  const rawMode = params.get('mode');
  const mode: BoardMode = rawMode === 'words' || rawMode === 'daily' ? rawMode : 'time';
  const raw = params.get('mode2') ?? '';
  const mode2 = optionsFor(mode).includes(raw) ? raw : DEFAULT_OPTION[mode];
  const rawLang = params.get('language');
  const language: BoardLanguage = (BOARD_LANGUAGES as readonly string[]).includes(rawLang ?? '')
    ? (rawLang as BoardLanguage)
    : 'en';
  return { mode, mode2, language };
}

/** The UTC calendar date (YYYY-MM-DD) `daysAgo` days before `now`. */
export function utcDate(now: number = Date.now(), daysAgo = 0): string {
  return new Date(now - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/** The mode2 the API expects: a daily pill becomes its UTC date, other modes pass through. */
export function apiMode2(filters: BoardFilters, now: number = Date.now()): string {
  if (filters.mode !== 'daily') return filters.mode2;
  return utcDate(now, filters.mode2 === 'yesterday' ? 1 : 0);
}

export function defaultOption(mode: BoardMode): string {
  return DEFAULT_OPTION[mode];
}
