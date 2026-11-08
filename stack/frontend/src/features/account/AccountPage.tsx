import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/useAuth';
import { resultsApi } from '@/lib/api';
import type { Result } from '@/lib/api/types';
import {
  buildBestRows,
  formatDate,
  formatDateTime,
  formatNumber,
  relativeTime,
  splitDuration,
  type BestRow,
} from './format';
import { ProgressChart } from './ProgressChart';

const RECENT_LIMIT = 100;
type Tr = (k: string, o?: Record<string, unknown>) => string;
const QUOTE_LENGTHS = ['short', 'medium', 'long', 'any'];

export default function AccountPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const { user, isLoading, logout } = useAuth();
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

  if (isLoading) return <p className="py-16 text-sub">{t('common:loading')}</p>;
  // While logging out the user is null too, so don't bounce to the login page then.
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
          <BestsTable rows={buildBestRows(summary.data.bests)} lang={lang} />
        ) : summary.isPending ? (
          <p className="text-sub">{t('common:loading')}</p>
        ) : null}
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

function optionLabel(mode: string, mode2: string | null, t: Tr): string {
  if (!mode2) return '';
  if (mode === 'time') return t('settings:seconds', { count: Number(mode2) });
  if (mode === 'words') return t('settings:wordCount', { count: Number(mode2) });
  if (mode === 'quote') return QUOTE_LENGTHS.includes(mode2) ? t(`settings:quoteLengths.${mode2}`) : mode2;
  if (mode === 'pangram' && Number.isFinite(Number(mode2))) {
    return t('settings:pangrams', { count: Number(mode2) });
  }
  return '';
}

function modeLabel(mode: string, t: Tr): string {
  return ['time', 'words', 'quote', 'zen', 'pangram', 'custom'].includes(mode)
    ? t(`settings:modes.${mode}`)
    : mode;
}

function BestsTable({ rows, lang }: { rows: BestRow[]; lang: string }) {
  const { t } = useTranslation();
  const tr: Tr = (k, o) => String(t(k, o));
  const dash = '–';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-left">
        <thead>
          <tr className="text-[0.9rem] text-sub">
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:bests.mode')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:bests.option')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:bests.language')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colWpm')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colAcc')}</th>
            <th scope="col" className="py-2 font-normal">{t('account:bests.date')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const first = i === 0 || rows[i - 1]?.mode !== row.mode;
            const b = row.best;
            return (
              <tr key={`${row.mode}-${row.mode2}-${b?.language ?? 'none'}-${i}`} className="border-t border-surface">
                <td className="py-2 pr-4 text-text">{first ? modeLabel(row.mode, tr) : ''}</td>
                <td className="py-2 pr-4 text-sub">{optionLabel(row.mode, row.mode2, tr) || dash}</td>
                <td className="py-2 pr-4 text-sub">{b ? tr(`settings:languages.${b.language}`) : dash}</td>
                <td className="tabular py-2 pr-4 text-right text-text">{b ? formatNumber(b.wpm, lang) : dash}</td>
                <td className="tabular py-2 pr-4 text-right text-text">
                  {b ? `${formatNumber(b.accuracy, lang, 1)}%` : dash}
                </td>
                <td className="py-2 text-sub">{b ? formatDate(b.createdAt, lang) : dash}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
              optionLabel(r.mode, r.mode2, tr),
              r.language ? tr(`settings:languages.${r.language}`) : '',
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

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4">
      <p className="text-error">{t('account:loadError')}</p>
      <Button variant="ghost" onClick={onRetry}>
        {t('common:retry')}
      </Button>
    </div>
  );
}
