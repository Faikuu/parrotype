import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { eventsApi } from '@/lib/api';
import { formatNumber } from '@/features/account/format';
import { useAuth } from '@/features/auth/useAuth';

/** The event's board: verified results only, one best per player. Visible to everyone, before and after the start. */
export function EventLeaderboard({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['events', 'leaderboard', slug],
    queryFn: ({ signal }) => eventsApi.leaderboard(slug, signal),
    enabled: slug !== '',
  });

  return (
    <section aria-labelledby="event-board-heading" className="flex flex-col gap-3">
      <h2 id="event-board-heading" className="text-[1.15rem] font-semibold text-text">
        {t('events:detail.leaderboard')}
      </h2>
      {query.isError ? (
        <p role="alert" className="text-error">
          {t('events:detail.leaderboardError')}
        </p>
      ) : query.isPending ? (
        <p className="text-sub">{t('common:loading')}</p>
      ) : query.data.length === 0 ? (
        <p className="text-sub">{t('events:detail.leaderboardEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-separate border-spacing-y-1 text-left text-[0.95rem]">
            <caption className="sr-only">{t('events:table.caption')}</caption>
            <thead>
              <tr className="text-sub">
                <th scope="col" className="px-3 py-1.5 font-normal">{t('events:table.rank')}</th>
                <th scope="col" className="px-3 py-1.5 font-normal">{t('events:table.name')}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal">{t('events:table.wpm')}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal">{t('events:table.accuracy')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((row) => {
                const mine = user?.name === row.name;
                return (
                  <tr key={`${row.rank}-${row.name}`} className={mine ? 'bg-surface text-main' : 'text-text'}>
                    <td className="tabular px-3 py-2">{row.rank}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold">{formatNumber(row.wpm, lang)}</td>
                    <td className="tabular px-3 py-2 text-right">{formatNumber(row.accuracy, lang, 1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
