import type { SaveState } from './useTypingTest';
import { MISMATCH_MESSAGE } from './useTypingTest';

/** The text a status change is announced with. `t` is the i18n function (namespaces a11y and verify). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface AnnouncementInput {
  /** The test has started (the first key went in). */
  started: boolean;
  /** The test has finished, with its rounded numbers, or null while it runs. */
  finished: { wpm: number; accuracy: number; failedWord: number | null } | null;
  save: SaveState;
}

/**
 * The text announced for the current state: the start or the finish (with its numbers), then the save state. Both
 * are joined, so a finish is still read out when the save status changes after it. Keystrokes are never announced.
 */
export function announcementFor(input: AnnouncementInput, t: Translate): string {
  let primary = '';
  if (input.finished) {
    const f = input.finished;
    primary = f.failedWord !== null
      ? t('a11y:testFailed', { word: f.failedWord })
      : t('a11y:testFinished', { wpm: Math.round(f.wpm), acc: Math.round(f.accuracy) });
  } else if (input.started) {
    primary = t('a11y:testStarted');
  }
  return [primary, saveAnnouncement(input.save, t)].filter((part) => part !== '').join(' ');
}

/** Why a finished test was not saved, as the results screen words it. */
const SKIP_REASON_KEY = {
  short: 'results:skippedShort',
  accuracy: 'results:skippedAccuracy',
  failed: 'results:skippedFailed',
} as const;

/** The message for a save status, or '' for states that say nothing. */
export function saveAnnouncement(save: SaveState, t: Translate): string {
  switch (save.status) {
    case 'saving':
      return t('a11y:saving');
    case 'saved':
      return save.verified ? t('a11y:savedVerified') : t('a11y:savedNotVerified');
    // These strings already begin with "Not saved", so they are announced as they are.
    case 'rejected':
      return save.message === MISMATCH_MESSAGE ? t('verify:notSavedMismatch') : t('verify:notSaved', { message: save.message });
    case 'error':
      return t('a11y:notSaved', { reason: save.message });
    case 'skipped':
      return save.reason === 'funbox' ? t('verify:funboxNotSaved') : t(SKIP_REASON_KEY[save.reason]);
    default:
      return '';
  }
}
