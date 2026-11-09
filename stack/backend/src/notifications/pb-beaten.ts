import type { ResultSavedEvent } from '../results/result-events';

/** Most followers one saved result may notify. */
export const PB_BEATEN_FOLLOWER_CAP = 50;

/** The 'saved' payload (src/results/result-events.ts). */
export type SavedResultEvent = ResultSavedEvent;

export interface FollowerBest {
  userId: number;
  /** The follower's best wpm in the same (mode, mode2, language), or null when they have none. */
  best: number | null;
}

/**
 * The followers a new best beats: their own best is above 0 and below the new wpm. Input order is kept
 * and the result is capped (PB_BEATEN_FOLLOWER_CAP). Pure, so the selection is tested without a database.
 */
export function beatenFollowers(
  wpm: number,
  followers: readonly FollowerBest[],
  cap: number = PB_BEATEN_FOLLOWER_CAP,
): number[] {
  const out: number[] = [];
  for (const follower of followers) {
    if (out.length >= cap) break;
    if (follower.best !== null && follower.best > 0 && follower.best < wpm) out.push(follower.userId);
  }
  return out;
}

/**
 * Whether a saved result is a pb_beaten trigger at all: verified, a new best, in a ranked mode.
 * Unranked modes never notify.
 */
export function isPbBeatenTrigger(
  event: Pick<SavedResultEvent, 'mode' | 'verified' | 'isNewBest'>,
  isRanked: (mode: string) => boolean,
): boolean {
  return event.verified && event.isNewBest && isRanked(event.mode);
}
