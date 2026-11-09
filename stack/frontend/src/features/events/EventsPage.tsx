import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '@/components/cn';
import { formatDateTime, relativeTime } from '@/features/account/format';
import { languageLabel } from '@/features/account/labels';
import { eventsApi } from '@/lib/api';
import type { EventSummary } from '@/lib/api/types';
import { useNow } from './useNow';

/** The events list: running now (highlighted), upcoming and past. */
export default function EventsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const now = useNow(30_000);
  const query = useQuery({
    queryKey: ['events', 'list'],
    queryFn: ({ signal }) => eventsApi.list(signal),
  });

  return (
    <div className="flex flex-col gap-10 pb-16 pt-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('events:list.title')}</h1>
        <p className="max-w-[60ch] text-sub">{t('events:list.intro')}</p>
      </header>

      {query.isError ? (
        <p role="alert" className="text-error">
          {t('events:list.loadError')}
        </p>
      ) : query.isPending ? (
        <p className="text-sub">{t('common:loading')}</p>
      ) : (
        <>
          {query.data.active.length + query.data.upcoming.length + query.data.past.length === 0 && (
            <p className="text-sub">{t('events:list.none')}</p>
          )}
          <EventSection
            id="events-active"
            title={t('events:list.active')}
            empty={t('events:list.activeEmpty')}
            items={query.data.active}
            render={(e) => (
              <EventCard event={e} highlight lang={lang} when={t('events:list.endsIn', { when: relativeTime(e.endsAt, lang, now) })} />
            )}
          />
          <EventSection
            id="events-upcoming"
            title={t('events:list.upcoming')}
            empty={t('events:list.upcomingEmpty')}
            items={query.data.upcoming}
            render={(e) => (
              <EventCard event={e} lang={lang} when={t('events:list.startsIn', { when: relativeTime(e.startsAt, lang, now) })} />
            )}
          />
          <EventSection
            id="events-past"
            title={t('events:list.past')}
            empty={t('events:list.pastEmpty')}
            items={query.data.past}
            render={(e) => (
              <EventCard event={e} lang={lang} when={t('events:list.endedAgo', { when: relativeTime(e.endsAt, lang, now) })} />
            )}
          />
        </>
      )}
    </div>
  );
}

function EventSection({
  id,
  title,
  empty,
  items,
  render,
}: {
  id: string;
  title: string;
  empty: string;
  items: EventSummary[];
  render: (e: EventSummary) => ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-[1.15rem] font-semibold text-text">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sub">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((e) => (
            <li key={e.slug}>{render(e)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventCard({
  event,
  highlight = false,
  lang,
  when,
}: {
  event: EventSummary;
  highlight?: boolean;
  lang: string;
  when: string;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/events/${encodeURIComponent(event.slug)}`}
      className={cn(
        'flex h-full flex-col gap-2 rounded-[10px] p-4 text-text no-underline transition-colors hover:bg-surface',
        highlight ? 'border border-main bg-surface' : 'bg-surface/60',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 break-words text-[1.05rem] font-semibold">{event.title}</h3>
        {highlight && <span className="shrink-0 text-[0.85rem] text-main">{t('events:list.running')}</span>}
      </div>
      {event.description && <p className="line-clamp-2 text-sub">{event.description}</p>}
      <p className="text-[0.9rem] text-sub">{t('events:list.language', { language: languageLabel(event.language) })}</p>
      <p className="text-[0.9rem] text-sub">{when}</p>
      <p className="tabular text-[0.85rem] text-sub">
        {t('events:list.window', {
          start: formatDateTime(event.startsAt, lang),
          end: formatDateTime(event.endsAt, lang),
        })}
      </p>
    </Link>
  );
}
