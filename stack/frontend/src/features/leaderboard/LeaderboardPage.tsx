import type { ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { formatDate } from '@/features/account/format';
import { useAuth } from '@/features/auth/useAuth';
import { leaderboardApi } from '@/lib/api';
import type { LeaderboardEntry } from '@/lib/api/types';
import { TIME_OPTIONS, WORDS_OPTIONS, parseFilters, type BoardFilters } from './filters';

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['leaderboard', filters.mode, filters.mode2, filters.language],
    queryFn: ({ signal }) =>
      leaderboardApi.get(
        { mode: filters.mode, mode2: String(filters.mode2), language: filters.language },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  function update(next: BoardFilters) {
    setParams(
      { mode: next.mode, mode2: String(next.mode2), language: next.language },
      { replace: true },
    );
  }

  const modeOptions = [
    { value: 'time' as const, label: t('settings:modes.time') },
    { value: 'words' as const, label: t('settings:modes.words') },
  ];
  const subOptions =
    filters.mode === 'words'
      ? WORDS_OPTIONS.map((n) => ({ value: n, label: t('settings:wordCount', { count: n }) }))
      : TIME_OPTIONS.map((n) => ({ value: n, label: t('settings:seconds', { count: n }) }));
  const languageOptions = [
    { value: 'en' as const, label: t('settings:languages.en') },
    { value: 'pl' as const, label: t('settings:languages.pl') },
  ];

  return (
    <div className="pb-16">
      <h1 className="pt-10 text-[1.6rem] font-semibold text-text">{t('leaderboard:title')}</h1>

      <div className="mt-6 flex flex-wrap gap-3">
        <PillGroup label={t('leaderboard:filters.mode')}>
          {modeOptions.map((o) => (
            <Pill
              key={o.value}
              active={filters.mode === o.value}
              onClick={() =>
                update({ ...filters, mode: o.value, mode2: o.value === 'words' ? 25 : 60 })
              }
            >
              {o.label}
            </Pill>
          ))}
        </PillGroup>
        <PillGroup label={t('leaderboard:filters.option')}>
          {subOptions.map((o) => (
            <Pill
              key={o.value}
              active={filters.mode2 === o.value}
              onClick={() => update({ ...filters, mode2: o.value })}
            >
              {o.label}
            </Pill>
          ))}
        </PillGroup>
        <PillGroup label={t('leaderboard:filters.language')}>
          {languageOptions.map((o) => (
            <Pill
              key={o.value}
              active={filters.language === o.value}
              onClick={() => update({ ...filters, language: o.value })}
            >
              {o.label}
            </Pill>
          ))}
        </PillGroup>
      </div>

      <div className="mt-8">
        {query.isPending ? (
          <p className="text-sub">{t('common:loading')}</p>
        ) : query.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-4">
            <p className="text-error">{t('leaderboard:loadError')}</p>
            <Button variant="ghost" onClick={() => void query.refetch()}>
              {t('common:retry')}
            </Button>
          </div>
        ) : query.data.length === 0 ? (
          <p className="text-text">{t('leaderboard:empty')}</p>
        ) : (
          <Table entries={query.data} lang={lang} viewer={user?.name ?? null} />
        )}
      </div>
    </div>
  );
}

function PillGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-[10px] bg-surface/60 p-1"
    >
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-[6px] px-3 py-1 text-[0.95rem] transition-colors',
        active ? 'text-main' : 'text-sub hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

const CARET_RANKS = 3;

function Table({
  entries,
  lang,
  viewer,
}: {
  entries: LeaderboardEntry[];
  lang: string;
  viewer: string | null;
}) {
  const { t } = useTranslation();
  const fmt = (n: number, digits = 0) =>
    new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(n);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="text-[0.9rem] text-sub">
            <th scope="col" className="py-2 pr-4 font-normal">{t('leaderboard:cols.rank')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('leaderboard:cols.name')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colWpm')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:recent.raw')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colAcc')}</th>
            <th scope="col" className="py-2 font-normal">{t('leaderboard:cols.date')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const mine = viewer !== null && e.name === viewer;
            const cell = cn('py-2 pr-4', mine ? 'text-main' : 'text-text');
            return (
              <tr key={`${e.rank}-${e.name}`} className="border-t border-surface">
                <td
                  className={cn(
                    'tabular py-2 pr-4',
                    e.rank <= CARET_RANKS ? 'text-caret' : mine ? 'text-main' : 'text-text',
                  )}
                >
                  {e.rank}
                </td>
                <td className={cell}>{e.name}</td>
                <td className={cn('tabular text-right', cell)}>{fmt(e.wpm)}</td>
                <td className={cn('tabular text-right', mine ? 'text-main' : 'text-sub', 'py-2 pr-4')}>
                  {fmt(e.rawWpm)}
                </td>
                <td className={cn('tabular text-right', cell)}>{fmt(e.accuracy, 1)}%</td>
                <td className={cn('py-2', mine ? 'text-main' : 'text-sub')}>
                  {formatDate(e.createdAt, lang)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
