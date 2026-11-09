import type { EngineEvent, Language } from '@/lib/engine/types';

/**
 * The first attempt at each daily text, kept so later attempts that day can race it. Stored in
 * localStorage under `parrotype:daily-ghost` and only the last DAILY_GHOST_KEEP dates are kept. Every
 * read and write is wrapped, so a blocked or full storage just means no daily ghost.
 */
export const DAILY_GHOST_KEY = 'parrotype:daily-ghost';
export const DAILY_GHOST_KEEP = 3;

const EVENT_KINDS: readonly EngineEvent['k'][] = ['c', 's', 'b', 'B', 'n'];

export interface DailyGhostRun {
  /** The target words of that attempt (daily text, including anything appended). */
  words: string[];
  events: EngineEvent[];
}

/** Keyed by `${date}|${language}`. */
export type DailyGhostMap = Record<string, DailyGhostRun>;

export function dailyGhostKey(date: string, language: Language): string {
  return `${date}|${language}`;
}

function dateOf(key: string): string {
  return key.slice(0, key.indexOf('|'));
}

function isEvent(value: unknown): value is EngineEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.t === 'number' &&
    Number.isFinite(e.t) &&
    typeof e.k === 'string' &&
    (EVENT_KINDS as readonly string[]).includes(e.k) &&
    (e.ch === undefined || typeof e.ch === 'string')
  );
}

function isRun(value: unknown): value is DailyGhostRun {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    Array.isArray(r.words) &&
    r.words.every((w) => typeof w === 'string') &&
    Array.isArray(r.events) &&
    r.events.every(isEvent)
  );
}

/** Drops every date except the `keep` most recent ones (ISO dates sort as strings). */
export function pruneDailyGhosts(map: DailyGhostMap, keep = DAILY_GHOST_KEEP): DailyGhostMap {
  const dates = [...new Set(Object.keys(map).map(dateOf))].sort().reverse();
  const kept = new Set(dates.slice(0, Math.max(0, keep)));
  const out: DailyGhostMap = {};
  for (const [key, run] of Object.entries(map)) {
    if (kept.has(dateOf(key))) out[key] = run;
  }
  return out;
}

/** The stored map, with corrupt entries left out. An empty map when storage is unavailable. */
export function readDailyGhosts(): DailyGhostMap {
  try {
    const raw = window.localStorage.getItem(DAILY_GHOST_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: DailyGhostMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (key.includes('|') && isRun(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns false when the write failed (storage blocked or full): the ghost is then not kept. */
function writeDailyGhosts(map: DailyGhostMap): boolean {
  try {
    window.localStorage.setItem(DAILY_GHOST_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/** The first attempt for this date and language, or null when there is none. */
export function getDailyGhost(date: string, language: Language): DailyGhostRun | null {
  return readDailyGhosts()[dailyGhostKey(date, language)] ?? null;
}

/**
 * Keeps `run` as the daily ghost when there is none yet for this date and language (the first attempt
 * wins). Returns true only when it was stored: false when there was already a ghost or the write failed.
 */
export function saveDailyGhost(date: string, language: Language, run: DailyGhostRun): boolean {
  const map = readDailyGhosts();
  const key = dailyGhostKey(date, language);
  if (map[key]) return false;
  return writeDailyGhosts(pruneDailyGhosts({ ...map, [key]: run }));
}
