import type { Summary } from '@/lib/api/types';

export type Bests = Summary['bests'];
export type BestEntry = Bests[number];

export function formatNumber(value: number, lang: string, maxFractionDigits = 0): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function formatDate(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** Relative time for recent results ("5 minutes ago"); falls back to the date after 30 days. */
export function relativeTime(iso: string, lang: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(iso, lang);
}

/** Splits a duration into whole hours and minutes (seconds are dropped). */
export function splitDuration(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** Trailing moving average. The first `window - 1` points are null, so the line starts at test `window`. */
export function movingAverage(values: number[], window = 10): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += values[j] ?? 0;
    return sum / window;
  });
}

export const BEST_LANGUAGE_ORDER: readonly string[] = ['en', 'pl', 'de', 'es'];

export interface BestRow {
  mode: string;
  /** The sub-option (time 15, words 25, quote "short", daily date...). Null when the mode has none. */
  mode2: string | null;
  /** Null when there is no result for this row yet (dash row). */
  best: BestEntry | null;
}

interface BestGroup {
  mode: string;
  /** Fixed sub-options, or null when the rows come from the results themselves. */
  mode2s: readonly string[] | null;
  /** Rows for results that exist, newest date first (daily). Otherwise by language, then wpm. */
  byDate?: boolean;
  /** Show a dash row when there are no results (unranked weak keys stays hidden until used). */
  showEmpty?: boolean;
}

/** Fixed sub-options for the modes that have them; other modes list whatever results exist. */
export const BEST_GROUPS: BestGroup[] = [
  { mode: 'time', mode2s: ['15', '30', '60', '120'] },
  { mode: 'words', mode2s: ['10', '25', '50', '100'] },
  { mode: 'quote', mode2s: null },
  { mode: 'pangram', mode2s: null },
  { mode: 'daily', mode2s: null, byDate: true },
  { mode: 'zen', mode2s: null },
  { mode: 'custom', mode2s: null },
  { mode: 'weak', mode2s: null, showEmpty: false },
];

function languageRank(lang: string): number {
  const i = BEST_LANGUAGE_ORDER.indexOf(lang);
  return i === -1 ? BEST_LANGUAGE_ORDER.length : i;
}

/**
 * One row per (mode, sub-option, language) that has a result, plus a dash row for every
 * sub-option (or mode) with no result, so the table always shows the whole menu.
 */
export function buildBestRows(bests: Bests): BestRow[] {
  const rows: BestRow[] = [];
  for (const group of BEST_GROUPS) {
    const inMode = bests
      .filter((b) => b.mode === group.mode)
      .sort((a, b) => {
        if (group.byDate && a.mode2 !== b.mode2) return a.mode2 < b.mode2 ? 1 : -1;
        return languageRank(a.language) - languageRank(b.language) || b.wpm - a.wpm;
      });
    if (group.mode2s) {
      for (const sub of group.mode2s) {
        const matches = inMode.filter((b) => b.mode2 === sub);
        if (matches.length === 0) rows.push({ mode: group.mode, mode2: sub, best: null });
        for (const best of matches) rows.push({ mode: group.mode, mode2: sub, best });
      }
    } else {
      if (inMode.length === 0 && group.showEmpty !== false) {
        rows.push({ mode: group.mode, mode2: null, best: null });
      }
      for (const best of inMode) rows.push({ mode: group.mode, mode2: best.mode2, best });
    }
  }
  return rows;
}
