// The announcement ids a viewer has dismissed. A per-browser convenience (docs/SPEC-2.5.md): storage can be
// blocked or empty, so every access is guarded and the banner works without it.

export const DISMISSED_KEY = 'parrotype.dismissedAnnouncements';
const KEEP = 100;

export function readDismissed(): number[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

export function writeDismissed(ids: number[]): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-KEEP)));
  } catch {
    // Storage is unavailable: the banner stays dismissed for this visit only.
  }
}
