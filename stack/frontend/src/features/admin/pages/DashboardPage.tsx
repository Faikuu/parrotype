import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/features/account/format';
import { adminApi } from '@/lib/api';
import { DayChart } from './DayChart';

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const query = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: ({ signal }) => adminApi.stats(signal),
  });

  const n = (value: number) => formatNumber(value, lang);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:dashboard.title')}</h1>

      {query.isError ? (
        <p role="alert" className="text-error">
          {t('admin:errors.load')}
        </p>
      ) : query.isPending ? (
        <p className="text-sub">{t('common:loading')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-5">
            <Stat label={t('admin:dashboard.stats.users')} value={n(query.data.users.total)} sub={t('admin:dashboard.stats.usersSub', { n: n(query.data.users.banned) })} />
            <Stat label={t('admin:dashboard.stats.newUsers')} value={n(query.data.users.new7d)} sub={t('admin:dashboard.stats.newUsersSub')} />
            <Stat label={t('admin:dashboard.stats.resultsToday')} value={n(query.data.results.today)} sub={t('admin:dashboard.stats.resultsSub', { n: n(query.data.results.total) })} />
            <Stat label={t('admin:dashboard.stats.openReports')} value={n(query.data.reports.open)} />
            <Stat label={t('admin:dashboard.stats.liveRaces')} value={n(query.data.races.rooms)} sub={t('admin:dashboard.stats.playersSub', { count: query.data.races.players })} />
          </dl>

          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="signups-heading" className="rounded-[10px] bg-surface p-4 md:p-5">
              <h2 id="signups-heading" className="mb-3 text-[1rem] font-medium text-text">
                {t('admin:dashboard.signups')}
              </h2>
              <DayChart title={t('admin:dashboard.signups')} data={query.data.signupsByDay} />
            </section>
            <section aria-labelledby="results-heading" className="rounded-[10px] bg-surface p-4 md:p-5">
              <h2 id="results-heading" className="mb-3 text-[1rem] font-medium text-text">
                {t('admin:dashboard.resultsPerDay')}
              </h2>
              <DayChart title={t('admin:dashboard.resultsPerDay')} data={query.data.resultsByDay} />
            </section>
          </div>
          <p className="text-[0.85rem] text-sub">{t('admin:dashboard.lastDays')}</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.9rem] text-sub">{label}</dt>
      <dd className="tabular mt-1 text-[2rem] font-semibold leading-none text-text">{value}</dd>
      {sub && <dd className="mt-1.5 text-[0.85rem] text-sub">{sub}</dd>}
    </div>
  );
}
