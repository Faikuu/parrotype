import type { Language } from '@/lib/engine/types';

export const TIME_OPTIONS = [15, 30, 60, 120] as const;
export const WORDS_OPTIONS = [10, 25, 50, 100] as const;

export interface BoardFilters {
  mode: 'time' | 'words';
  mode2: number;
  language: Language;
}

/** Reads the filters from the URL, falling back to defaults for anything unknown. */
export function parseFilters(params: URLSearchParams): BoardFilters {
  const mode: BoardFilters['mode'] = params.get('mode') === 'words' ? 'words' : 'time';
  const options: readonly number[] = mode === 'words' ? WORDS_OPTIONS : TIME_OPTIONS;
  const raw = Number(params.get('mode2'));
  const mode2 = options.includes(raw) ? raw : mode === 'words' ? 25 : 60;
  const language: Language = params.get('language') === 'pl' ? 'pl' : 'en';
  return { mode, mode2, language };
}
