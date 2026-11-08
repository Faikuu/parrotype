import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { formatDate } from '@/features/account/format';
import { BOARD_LANGUAGES, LANGUAGE_NAMES, type BoardLanguage } from '@/features/account/labels';
import { useAuth } from '@/features/auth/useAuth';
import { leaderboardApi } from '@/lib/api';
import type { LeaderboardEntry } from '@/lib/api/types';
import {
  DAY_OPTIONS,
  TIME_OPTIONS,
  WORDS_OPTIONS,
  apiMode2,
  defaultOption,
  parseFilters,
  type BoardFilters,
  type BoardMode,
} from './filters';

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const { user } = useAuth();
  // The UTC day the page was opened on; daily pills are dates relative to it.
  const [now] = useState(() => Date.now());
  const board = apiMode2(filters, now);

  const query = useQuery({
    queryKey: ['leaderboard', filters.mode, board, filters.language],
    queryFn: ({ signal }) =>
      leaderboardApi.get({ mode: filters.mode, mode2: board, language: filters.language }, signal),
    placeholderData: keepPreviousData,
  });

  function update(next: BoardFilters) {
    setParams(
      { mode: next.mode, mode2: next.mode2, language: next.language },
      { replace: true },
    );
  }

  const modeOptions: { value: BoardMode; label: string }[] = [
    { value: 'time', label: t('settings:modes.time') },
    { value: 'words', label: t('settings:modes.words') },
    { value: 'daily', label: t('account:modes.daily') },
  ];

  let optionGroup: { label: string; pills: { value: string; label: string }[] };
  if (filters.mode === 'daily') {
    optionGroup = {
      label: t('leaderboard:filters.day'),
      pills: DAY_OPTIONS.map((d) => ({ value: d, label: t(`leaderboard:daily.${d}`) })),
    };
  } else if (filters.mode === 'words') {
    optionGroup = {
      label: t('leaderboard:filters.option'),
      pills: WORDS_OPTIONS.map((n) => ({ value: String(n), label: t('settings:wordCount', { count: n }) })),
    };
  } else {
    optionGroup = {
      label: t('leaderboard:filters.option'),
      pills: TIME_OPTIONS.map((n) => ({ value: String(n), label: t('settings:seconds', { count: n }) })),
    };
  }

  return (
    <div className="pb-16">
      <h1 className="pt-10 text-[1.6rem] font-semibold text-text">{t('leaderboard:title')}</h1>

      <div className="mt-6 flex flex-wrap gap-3">
        <PillGroup label={t('leaderboard:filters.mode')}>
          {modeOptions.map((o) => (
            <Pill
              key={o.value}
              active={filters.mode === o.value}
              onClick={() => update({ ...filters, mode: o.value, mode2: defaultOption(o.value) })}
            >
              {o.label}
            </Pill>
          ))}
        </PillGroup>
        <PillGroup label={optionGroup.label}>
          {optionGroup.pills.map((o) => (
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
          {BOARD_LANGUAGES.map((code: BoardLanguage) => (
            <Pill
              key={code}
              active={filters.language === code}
              onClick={() => update({ ...filters, language: code })}
            >
              {LANGUAGE_NAMES[code]}
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
                <td className={cell}>
                  <Link
                    to={`/u/${encodeURIComponent(e.name)}`}
                    className={cn(
                      'underline-offset-4 hover:underline',
                      mine ? 'text-main' : 'text-text',
                    )}
                  >
                    {e.name}
                  </Link>
                </td>
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
