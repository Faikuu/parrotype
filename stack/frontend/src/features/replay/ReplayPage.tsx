import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { formatDate } from '@/features/account/format';
import { ApiError, resultsApi } from '@/lib/api';
import type { ReplayDto } from '@/lib/api/types';
import { ReplayPlayer } from '@/features/test/ReplayPlayer';
import { testLabel } from '@/features/test/testLabel';
import { configFromResult, finalStateOf } from './replayConfig';

/** The full-page replay of a verified result (/replay/:resultId): a summary, then the player. */
export default function ReplayPage() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const id = Number(params.resultId);
  const valid = Number.isInteger(id) && id > 0;

  const query = useQuery({
    queryKey: ['replay', id],
    queryFn: ({ signal }) => resultsApi.replay(id, signal),
    enabled: valid,
    retry: false,
  });

  if (!valid) return <NotFound />;
  if (query.isPending) {
    return (
      <div className="pb-16">
        <p className="pt-10 text-sub">{t('verify:replayLoading')}</p>
      </div>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <div className="pb-16" role="alert">
        <p className="pt-10 text-error">{t('verify:replayLoadError')}</p>
        <div className="mt-4">
          <Button variant="ghost" onClick={() => void query.refetch()}>
            {t('common:retry')}
          </Button>
        </div>
      </div>
    );
  }
  return <ReplayContent data={query.data} locale={i18n.resolvedLanguage ?? 'en'} />;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="pb-16">
      <h1 className="pt-10 text-[1.6rem] font-semibold text-text">{t('verify:replayPageTitle')}</h1>
      <p className="mt-4 text-sub">{t('verify:replayNotFound')}</p>
      <Link to="/leaderboard" className="mt-6 inline-block text-text underline underline-offset-4 hover:text-main">
        {t('verify:backToBoard')}
      </Link>
    </div>
  );
}

function ReplayContent({ data, locale }: { data: ReplayDto; locale: string }) {
  const { t } = useTranslation();
  const { result, replay } = data;
  const config = useMemo(() => configFromResult(result), [result]);
  const final = useMemo(
    () => finalStateOf(config, replay.words, replay.events, replay.code),
    [config, replay],
  );
  const label = testLabel(config, t);
  const acc = Math.round(result.accuracy);

  return (
    <div className="flex flex-col gap-8 pb-16">
      <header className="flex flex-col gap-3 pt-10">
        <h1 className="m-0 text-[1.6rem] font-semibold text-text">{t('verify:replayPageTitle')}</h1>
        <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-text">
          <Link to={`/u/${encodeURIComponent(result.name)}`} className="font-semibold underline-offset-4 hover:underline">
            {result.name}
          </Link>
          <span className="text-sub">{label}</span>
          <span className="text-sub">{formatDate(result.createdAt, locale)}</span>
        </p>
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dd className="m-0 text-[2.5rem] leading-none tabular-nums text-main">{Math.round(result.wpm)}</dd>
            <dt className="mt-1 text-[0.85rem] text-sub">{t('results:wpm')}</dt>
          </div>
          <div>
            <dd className="m-0 text-[2rem] leading-none tabular-nums text-main">{acc}%</dd>
            <dt className="mt-1 text-[0.85rem] text-sub">{t('results:acc')}</dt>
          </div>
        </dl>
      </header>

      <ReplayPlayer
        config={config}
        words={replay.words}
        events={replay.events}
        final={final}
        code={replay.code}
      />
    </div>
  );
}
