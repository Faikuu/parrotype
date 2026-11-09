import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { announcementFor, type AnnouncementInput } from './announcements';

/** How long a message waits before it is read out, so that a quick run of changes becomes one announcement. */
export const ANNOUNCE_DELAY_MS = 300;

/**
 * A polite live region for the test's status: the start, the finish with its numbers, and the save state. The
 * text is set after a short delay and only when it changes, so the region is never read on every keystroke.
 */
export function TestAnnouncer({ input }: { input: AnnouncementInput }) {
  const { t } = useTranslation();
  const message = announcementFor(input, t);
  const [spoken, setSpoken] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setSpoken(message), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(id);
  }, [message]);

  return (
    <div role="status" aria-live="polite" aria-label={t('a11y:liveRegion')} className="sr-only">
      {spoken}
    </div>
  );
}
