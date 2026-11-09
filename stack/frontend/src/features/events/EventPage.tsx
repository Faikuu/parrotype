import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/Button';
import { formatDateTime } from '@/features/account/format';
import { languageLabel } from '@/features/account/labels';
import { useAuth } from '@/features/auth/useAuth';
import { ApiError, eventsApi, resultsApi } from '@/lib/api';
import type { EventDetail, ResultInput } from '@/lib/api/types';
import { EventLeaderboard } from './EventLeaderboard';
import { EventTypingArea } from './EventTypingArea';
import { countdownText, stateAt } from './timing';
import { useNow } from './useNow';
import { eventResultInput } from './submission';
import type { EngineState } from '@/lib/engine/types';

/** One event: its details, the countdown to the start, the typing view while it runs, and its board. */
export default function EventPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const now = useNow(1000);
  const [typing, setTyping] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const detail = useQuery({
    queryKey: ['events', 'detail', slug],
    queryFn: ({ signal }) => eventsApi.detail(slug, signal),
    enabled: slug !== '',
    // A missing event is not going to appear on a retry.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const event: EventDetail | undefined = detail.data;
  const state = event ? stateAt(event.startsAt, event.endsAt, now) : null;
  const textMissing = event !== undefined && event.text === null;
  const refetch = detail.refetch;

  // The text comes with the detail only once the event has started. When the start passes, fetch it again.
  useEffect(() => {
    if (state !== null && state !== 'upcoming' && textMissing) void refetch();
  }, [state, textMissing, refetch]);

  const submit = useMutation({
    mutationFn: (input: ResultInput) => resultsApi.submit(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events', 'leaderboard', slug] });
      void qc.invalidateQueries({ queryKey: ['results'] });
    },
  });

  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div className="flex flex-col gap-4 pb-16 pt-10">
        <BackLink />
        <p role="alert" className="text-error">
          {notFound ? t('events:detail.notFound') : t('events:detail.loadError')}
        </p>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="pb-16 pt-10">
        <p className="text-sub">{t('common:loading')}</p>
      </div>
    );
  }

  const language = languageLabel(event.language);
  const canType = state === 'active' && event.text !== null && user !== null;

  function handleFinish(finished: EngineState) {
    setTyping(false);
    const input = eventResultInput(finished, event!.slug, event!.language);
    submit.mutate(input);
  }

  function startAttempt() {
    setAttempt((n) => n + 1);
    submit.reset();
    setTyping(true);
  }

  return (
    <div className="flex flex-col gap-10 pb-16 pt-10">
      <div className="flex flex-col gap-4">
        <BackLink />
        <header className="flex flex-col gap-2">
          <h1 className="break-words text-[1.6rem] font-semibold text-text">{event.title}</h1>
          <p className="text-[0.95rem] text-sub">{t('events:detail.language', { language })}</p>
          <p className="tabular text-[0.9rem] text-sub">
            {t('events:detail.windowLocal', {
              start: formatDateTime(event.startsAt, lang),
              end: formatDateTime(event.endsAt, lang),
            })}
          </p>
          {event.description && <p className="max-w-[65ch] whitespace-pre-line text-text">{event.description}</p>}
        </header>
      </div>

      <section aria-label={event.title} className="flex flex-col gap-4 rounded-[10px] bg-surface/60 p-5">
        {state === 'upcoming' && (
          <>
            <p role="timer" className="tabular text-[1.8rem] font-semibold text-main">
              {t('events:detail.countdown', {
                time: countdownText(Date.parse(event.startsAt) - now, (n) => t('events:detail.days', { n })),
              })}
            </p>
            <p className="text-sub">{t('events:detail.textHidden')}</p>
          </>
        )}

        {state === 'past' && <p className="text-sub">{t('events:detail.ended')}</p>}

        {state === 'active' && !typing && (
          <div className="flex flex-col gap-3">
            {authLoading ? null : user ? (
              <>
                <p className="text-sub">{t('events:detail.running')}</p>
                <div>
                  <Button onClick={startAttempt} disabled={!canType}>
                    {submit.isSuccess || submit.isError ? t('events:detail.retry') : t('events:detail.start')}
                  </Button>
                </div>
              </>
            ) : (
              <p className="flex flex-wrap items-center gap-2 text-text">
                <span>{t('events:detail.logIn')}.</span>
                <Link to={`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`} className="text-main">
                  {t('events:detail.logInLink')}
                </Link>
              </p>
            )}
          </div>
        )}

        {state === 'active' && typing && event.text !== null && (
          <EventTypingArea key={attempt} text={event.text} language={event.language} onFinish={handleFinish} />
        )}

        {(submit.isPending || submit.isSuccess || submit.isError) && (
          <ResultPanel
            pending={submit.isPending}
            error={submit.error}
            verified={submit.data?.verified === true}
            wpm={submit.variables?.wpm}
            accuracy={submit.variables?.accuracy}
          />
        )}
      </section>

      <EventLeaderboard slug={event.slug} />
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link to="/events" className="inline-flex w-fit items-center gap-1 text-[0.95rem] text-sub no-underline hover:text-text">
      <ChevronLeft size={16} aria-hidden="true" />
      {t('events:detail.back')}
    </Link>
  );
}

/** The outcome of the last run: its stats, and whether the server verified the replay and saved it. */
function ResultPanel({
  pending,
  error,
  verified,
  wpm,
  accuracy,
}: {
  pending: boolean;
  error: unknown;
  verified: boolean;
  wpm: number | undefined;
  accuracy: number | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 border-t border-bg pt-4" aria-live="polite">
      <h2 className="text-[0.95rem] font-semibold text-text">{t('events:detail.yourResult')}</h2>
      {wpm !== undefined && accuracy !== undefined && (
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tabular text-[2.5rem] font-semibold leading-none text-main">
            {t('events:detail.resultWpm', { wpm: Math.round(wpm) })}
          </span>
          <span className="tabular text-sub">{t('events:detail.resultAccuracy', { acc: Math.round(accuracy * 10) / 10 })}</span>
        </p>
      )}
      {pending ? (
        <p className="text-sub">{t('events:detail.saving')}</p>
      ) : error ? (
        <p role="alert" className="text-error">
          {t('events:detail.saveError', { message: error instanceof Error ? error.message : '' })}
        </p>
      ) : verified ? (
        <p className="text-text">{t('events:detail.verified')}</p>
      ) : null}
    </div>
  );
}
