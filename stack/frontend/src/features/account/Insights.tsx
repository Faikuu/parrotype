import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { resultsApi } from '@/lib/api';
import type { Insights as InsightsData, Streak } from '@/lib/api/types';
import { ActivityCalendar } from './ActivityCalendar';
import { HourChart, WpmHistogram } from './InsightCharts';
import { LoadError } from './LoadError';

/** The signed-in user's insights. Shared by the account page's sections, under one key. */
export function useInsights(enabled = true) {
  return useQuery({
    queryKey: ['insights'],
    queryFn: ({ signal }) => resultsApi.insights(signal),
    enabled,
  });
}

/** "Current streak 4 days, longest 12", with the plural from i18next. */
export function StreakLine({ streak }: { streak: Streak }) {
  const { t } = useTranslation();
  let text: string;
  if (streak.longest === 0) text = t('insights.streak.empty');
  else if (streak.current === 0) text = t('insights.streak.none', { longest: streak.longest });
  else text = t('insights.streak.current', { count: streak.current, longest: streak.longest });
  return <p className="text-[1.1rem] text-text">{text}</p>;
}

/** Calendar, histogram and hour chart, under the account page's Insights heading. */
export function InsightsBody({ data }: { data: InsightsData }) {
  const { t } = useTranslation();
  const none = data.activity.length === 0;

  return (
    <div className="flex flex-col gap-10">
      <StreakLine streak={data.streak} />

      <div>
        <h3 className="mb-1 text-[1rem] font-semibold text-text">{t('insights.calendar.heading')}</h3>
        <ActivityCalendar activity={data.activity} />
      </div>

      {none ? null : (
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-[1rem] font-semibold text-text">{t('insights.histogram.heading')}</h3>
            <p className="mb-3 text-[0.9rem] text-sub">{t('insights.histogram.caption')}</p>
            {data.histogram.length === 0 ? null : <WpmHistogram buckets={data.histogram} />}
          </div>
          <div>
            <h3 className="text-[1rem] font-semibold text-text">{t('insights.byHour.heading')}</h3>
            <p className="mb-3 text-[0.9rem] text-sub">{t('insights.byHour.caption')}</p>
            <HourChart hours={data.byHour} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The whole Insights section for the account page. */
export function InsightsSection({
  query,
}: {
  query: ReturnType<typeof useInsights>;
}) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="account-insights" className="mt-12">
      <h2 id="account-insights" className="mb-4 text-[1.1rem] font-semibold text-text">
        {t('insights.heading')}
      </h2>
      {query.isPending ? (
        <p className="text-sub">{t('common:loading')}</p>
      ) : query.isError || !query.data ? (
        <LoadError message={t('insights.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <InsightsBody data={query.data} />
      )}
    </section>
  );
}
