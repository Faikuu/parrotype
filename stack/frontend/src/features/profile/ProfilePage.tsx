import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/Button';
import { BestsTable } from '@/features/account/BestsTable';
import { formatDate, formatNumber, relativeTime, splitDuration } from '@/features/account/format';
import { languageLabel, modeLabel, optionLabel, type Tr } from '@/features/account/labels';
import { ApiError, usersApi } from '@/lib/api';
import type { PublicProfile, RecentResult } from '@/lib/api/types';

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { name = '' } = useParams();

  const query = useQuery({
    queryKey: ['profile', name],
    queryFn: ({ signal }) => usersApi.profile(name, signal),
    // A missing user will not appear on a retry, so don't repeat that request.
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status === 404) && failureCount < 1,
    enabled: name.length > 0,
  });

  useEffect(() => {
    const previous = document.title;
    document.title = t('profile:documentTitle', { name });
    return () => {
      document.title = previous;
    };
  }, [name, t]);

  if (query.isPending) return <p className="py-16 text-sub">{t('common:loading')}</p>;

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <NotFound />;
    }
    return (
      <div role="alert" className="flex flex-wrap items-center gap-4 py-16">
        <p className="text-error">{t('profile:loadError')}</p>
        <Button variant="ghost" onClick={() => void query.refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    );
  }

  const p: PublicProfile = query.data;

  return (
    <div className="pb-16">
      <header className="pt-10">
        <h1 className="text-[2rem] font-semibold text-text">{p.name}</h1>
        <p className="text-sub">{t('profile:joined', { date: formatDate(p.createdAt, lang) })}</p>
      </header>

      <section aria-labelledby="profile-totals" className="mt-8">
        <h2 id="profile-totals" className="sr-only">
          {t('account:stats.heading')}
        </h2>
        <Totals totalTests={p.totalTests} totalTimeMs={p.totalTimeMs} lang={lang} />
      </section>

      <section aria-labelledby="profile-bests" className="mt-12">
        <h2 id="profile-bests" className="mb-4 text-[1.1rem] font-semibold text-text">
          {t('account:bests.heading')}
        </h2>
        <BestsTable bests={p.bests} lang={lang} />
      </section>

      <section aria-labelledby="profile-recent" className="mt-12">
        <h2 id="profile-recent" className="mb-4 text-[1.1rem] font-semibold text-text">
          {t('profile:recent.heading')}
        </h2>
        {p.recent.length === 0 ? (
          <p className="text-sub">{t('profile:recent.empty')}</p>
        ) : (
          <RecentTable results={p.recent} lang={lang} />
        )}
      </section>
    </div>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('profile:notFound.body')}</h1>
      <Link to="/leaderboard" className="text-main underline underline-offset-4">
        {t('profile:notFound.link')}
      </Link>
    </div>
  );
}

function Totals({ totalTests, totalTimeMs, lang }: { totalTests: number; totalTimeMs: number; lang: string }) {
  const { t } = useTranslation();
  const { hours, minutes } = splitDuration(totalTimeMs);
  const time = hours > 0
    ? t('account:duration', { hours, minutes })
    : t('account:durationMinutes', { minutes });
  const items = [
    { value: formatNumber(totalTests, lang), label: t('account:stats.tests') },
    { value: time, label: t('account:stats.time') },
  ];
  return (
    <div className="flex flex-wrap gap-x-12 gap-y-6">
      {items.map((item) => (
        <div key={item.label}>
          <p className="tabular text-[2rem] leading-tight font-semibold text-main">{item.value}</p>
          <p className="text-[0.9rem] text-sub">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function RecentTable({ results, lang }: { results: RecentResult[]; lang: string }) {
  const { t } = useTranslation();
  const tr: Tr = (k, o) => String(t(k, o));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left">
        <thead>
          <tr className="text-[0.9rem] text-sub">
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:recent.when')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:recent.test')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colWpm')}</th>
            <th scope="col" className="py-2 text-right font-normal">{t('account:colAcc')}</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const label = [
              modeLabel(r.mode, tr),
              optionLabel(r.mode, r.mode2, tr, lang),
              r.language ? languageLabel(r.language) : '',
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <tr key={`${r.createdAt}-${i}`} className="border-t border-surface">
                <td className="py-2 pr-4 whitespace-nowrap text-sub">
                  <time dateTime={r.createdAt}>{relativeTime(r.createdAt, lang)}</time>
                </td>
                <td className="py-2 pr-4 text-text">{label}</td>
                <td className="tabular py-2 pr-4 text-right text-text">{formatNumber(r.wpm, lang)}</td>
                <td className="tabular py-2 text-right text-sub">{formatNumber(r.accuracy, lang, 1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
