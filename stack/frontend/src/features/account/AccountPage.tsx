import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/useAuth';
import { resultsApi } from '@/lib/api';
import type { Result } from '@/lib/api/types';
import { AchievementsGrid } from './AchievementsGrid';
import { BestsTable } from './BestsTable';
import { ChangePasswordForm } from './ChangePassword';
import { DataExport } from './DataExport';
import { DeleteAccountForm } from './DeleteAccount';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  relativeTime,
  splitDuration,
} from './format';
import { languageLabel, modeLabel, optionLabel, type Tr } from './labels';
import { InsightsSection } from './Insights';
import { LoadError } from './LoadError';
import { ProgressChart } from './ProgressChart';
import { useInsights } from './useInsights';

const RECENT_LIMIT = 100;

export default function AccountPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const { user, isLoading, logout } = useAuth();
  // Set while logging out or deleting the account: the user is null then, but we are not bouncing to login.
  const [leaving, setLeaving] = useState(false);

  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: ({ signal }) => resultsApi.summary(signal),
    enabled: user !== null,
  });
  const results = useQuery({
    queryKey: ['results', 'mine', RECENT_LIMIT],
    queryFn: ({ signal }) => resultsApi.mine(RECENT_LIMIT, signal),
    enabled: user !== null,
  });
  const insights = useInsights(user !== null);

  if (isLoading) return <p className="py-16 text-sub">{t('common:loading')}</p>;
  if (!user && !leaving) return <Navigate to="/login?next=/account" replace />;
  if (!user) return null;

  async function onLogout() {
    setLeaving(true);
    try {
      await logout();
      navigate('/');
    } catch {
      setLeaving(false);
    }
  }

  const list: Result[] = results.data ?? [];
  const hasResults = list.length > 0;

  return (
    <div className="pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 pt-10">
        <div>
          <h1 className="text-[2rem] font-semibold text-text">{user.name}</h1>
          <p className="text-sub">
            {t('account:joined', { date: formatDate(user.createdAt, lang) })}
          </p>
          <Link
            to={`/u/${encodeURIComponent(user.name)}`}
            className="mt-2 inline-block text-main underline underline-offset-4"
          >
            {t('account:viewProfile')}
          </Link>
        </div>
        <Button variant="ghost" onClick={onLogout} disabled={leaving}>
          {t('account:logout')}
        </Button>
      </header>

      <section aria-labelledby="account-stats" className="mt-10">
        <h2 id="account-stats" className="sr-only">
          {t('account:stats.heading')}
        </h2>
        {summary.isPending ? (
          <p className="text-sub">{t('common:loading')}</p>
        ) : summary.isError || !summary.data ? (
          <LoadError onRetry={() => void summary.refetch()} />
        ) : (
          <StatsRow
            totalTests={summary.data.totalTests}
            totalTimeMs={summary.data.totalTimeMs}
            averageWpm={summary.data.averageWpm}
            averageAccuracy={summary.data.averageAccuracy}
            lang={lang}
          />
        )}
      </section>

      <section aria-labelledby="account-bests" className="mt-12">
        <h2 id="account-bests" className="mb-4 text-[1.1rem] font-semibold text-text">
          {t('account:bests.heading')}
        </h2>
        {summary.data ? (
          <BestsTable bests={summary.data.bests} lang={lang} />
        ) : summary.isPending ? (
          <p className="text-sub">{t('common:loading')}</p>
        ) : null}
      </section>

      <InsightsSection query={insights} />

      <section aria-labelledby="account-achievements" className="mt-12">
        <h2 id="account-achievements" className="mb-4 text-[1.1rem] font-semibold text-text">
          {t('achievements:heading')}
        </h2>
        {insights.isPending ? (
          <p className="text-sub">{t('common:loading')}</p>
        ) : insights.isError || !insights.data ? (
          <LoadError onRetry={() => void insights.refetch()} />
        ) : (
          <AchievementsGrid achievements={insights.data.achievements} />
        )}
      </section>

      <section aria-labelledby="account-progress" className="mt-12">
        <h2 id="account-progress" className="text-[1.1rem] font-semibold text-text">
          {t('account:progress.heading')}
        </h2>
        <p className="mb-4 text-[0.9rem] text-sub">{t('account:progress.caption')}</p>
        {results.isPending ? (
          <p className="text-sub">{t('common:loading')}</p>
        ) : results.isError ? (
          <LoadError onRetry={() => void results.refetch()} />
        ) : hasResults ? (
          <ProgressChart results={list} />
        ) : (
          <EmptyState />
        )}
      </section>

      {hasResults ? (
        <section aria-labelledby="account-recent" className="mt-12">
          <h2 id="account-recent" className="mb-4 text-[1.1rem] font-semibold text-text">
            {t('account:recent.heading')}
          </h2>
          <RecentTable results={list.slice(0, 50)} lang={lang} />
        </section>
      ) : null}

      <section aria-labelledby="account-settings" className="mt-16 border-t border-surface pt-10">
        <h2 id="account-settings" className="text-[1.1rem] font-semibold text-text">
          {t('account:settings.heading')}
        </h2>
        <div className="mt-8 grid gap-12 md:grid-cols-2">
          <ChangePasswordForm />
          <DeleteAccountForm name={user.name} onLeaving={setLeaving} />
        </div>
        <div className="mt-12">
          <DataExport />
        </div>
      </section>
    </div>
  );
}

function StatsRow(props: {
  totalTests: number;
  totalTimeMs: number;
  averageWpm: number;
  averageAccuracy: number;
  lang: string;
}) {
  const { t } = useTranslation();
  const { totalTests, totalTimeMs, averageWpm, averageAccuracy, lang } = props;
  const none = totalTests === 0;
  const { hours, minutes } = splitDuration(totalTimeMs);
  const time = hours > 0
    ? t('account:duration', { hours, minutes })
    : t('account:durationMinutes', { minutes });

  const items: { value: string; label: string }[] = [
    { value: formatNumber(totalTests, lang), label: t('account:stats.tests') },
    { value: time, label: t('account:stats.time') },
    {
      value: none ? '–' : formatNumber(averageWpm, lang),
      label: t('account:stats.avgWpm'),
    },
    {
      value: none ? '–' : `${formatNumber(averageAccuracy, lang, 1)}%`,
      label: t('account:stats.avgAcc'),
    },
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

function RecentTable({ results, lang }: { results: Result[]; lang: string }) {
  const { t } = useTranslation();
  const tr: Tr = (k, o) => String(t(k, o));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="text-[0.9rem] text-sub">
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:recent.when')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:recent.test')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colWpm')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:recent.raw')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colAcc')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:recent.consistency')}</th>
            <th scope="col" className="py-2 text-right font-normal" title={t('account:recent.charsHint')}>
              {t('account:recent.chars')}
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const label = [
              modeLabel(r.mode, tr),
              optionLabel(r.mode, r.mode2, tr, lang),
              r.language ? languageLabel(r.language) : '',
            ]
              .filter(Boolean)
              .join(', ');
            const cs = r.charStats;
            return (
              <tr key={r.id} className="border-t border-surface">
                <td className="py-2 pr-4 whitespace-nowrap text-sub">
                  <time dateTime={r.createdAt} title={formatDateTime(r.createdAt, lang)}>
                    {relativeTime(r.createdAt, lang)}
                  </time>
                </td>
                <td className="py-2 pr-4 text-text">{label}</td>
                <td className="tabular py-2 pr-4 text-right text-text">{formatNumber(r.wpm, lang)}</td>
                <td className="tabular py-2 pr-4 text-right text-sub">{formatNumber(r.rawWpm, lang)}</td>
                <td className="tabular py-2 pr-4 text-right text-sub">
                  {formatNumber(r.accuracy, lang, 1)}%
                </td>
                <td className="tabular py-2 pr-4 text-right text-sub">
                  {formatNumber(r.consistency, lang)}%
                </td>
                <td className="tabular py-2 text-right text-sub">
                  {`${cs.correct}/${cs.incorrect}/${cs.extra}/${cs.missed}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="rounded-[10px] bg-surface/60 px-5 py-8">
      <p className="text-text">{t('account:empty.body')}</p>
      <Link to="/" className="mt-2 inline-block text-main underline underline-offset-4">
        {t('account:empty.link')}
      </Link>
    </div>
  );
}
