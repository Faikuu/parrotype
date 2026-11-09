import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { modeLabel, type Tr } from '@/features/account/labels';
import type { AppNotification } from '@/lib/api/types';

const profilePath = (name: string) => `/u/${encodeURIComponent(name)}`;
const TIMED_MODES = ['time', 'words'];

/** The leaderboard page for a best: the filters the board reads from the query string. */
function boardPath(mode: string, mode2: string, language: string): string | null {
  if (!TIMED_MODES.includes(mode) || !/^\d+$/.test(mode2)) return null;
  const qs = new URLSearchParams({ mode, mode2, language: language || 'en' });
  return `/leaderboard?${qs.toString()}`;
}

const text = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

/**
 * One notification as a sentence, with the people and places it names as links. The sentences live in the
 * notifications namespace: `<user>` is the profile link, `<board>` the leaderboard for the best.
 */
export function NotificationText({ item }: { item: AppNotification }) {
  const { t, i18n } = useTranslation();
  const tr: Tr = (key, opts) => String(t(key as never, opts as never));
  const d = item.data;

  if (item.kind === 'follow') {
    const by = text(d.by);
    return (
      <Trans
        i18nKey="notifications:kinds.follow"
        values={{ by }}
        components={{ user: <Link to={profilePath(by)} className="text-main" /> }}
      />
    );
  }

  if (item.kind === 'report_outcome') {
    const target = text(d.target);
    return (
      <Trans
        i18nKey="notifications:kinds.reportOutcome"
        values={{ target }}
        components={{ user: <Link to={profilePath(target)} className="text-main" /> }}
      />
    );
  }

  if (item.kind === 'pb_beaten') {
    const by = text(d.by);
    const mode = text(d.mode);
    const mode2 = text(d.mode2);
    const label = [modeLabel(mode, tr), mode2].filter(Boolean).join(' ').toLocaleLowerCase(i18n.resolvedLanguage ?? 'en');
    const board = boardPath(mode, mode2, text(d.language));
    return (
      <Trans
        i18nKey="notifications:kinds.pbBeaten"
        values={{ by, mode: label, wpm: text(d.wpm) }}
        components={{
          user: <Link to={profilePath(by)} className="text-main" />,
          board: board ? <Link to={board} className="text-main" /> : <span />,
        }}
      />
    );
  }

  return <>{t('notifications:kinds.unknown')}</>;
}
