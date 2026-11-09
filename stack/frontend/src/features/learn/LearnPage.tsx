import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Kbd } from '@/components/Kbd';
import { cn } from '@/components/cn';
import { formatNumber } from '@/features/account/format';
import type { Lesson } from '@/lib/text/lessons';
import { useSettings } from '@/store/settings';
import { LessonView } from './LessonView';
import {
  lessonRows,
  loadProgress,
  nextLesson,
  recordAttempt,
  saveProgress,
  type LessonProgress,
  type LessonResult,
  type LessonRow,
} from './progress';

export default function LearnPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  const layout = useSettings((s) => s.layout);
  const [progress, setProgress] = useState<LessonProgress>(() => loadProgress());
  const [saveFailed, setSaveFailed] = useState(false);
  const rows = useMemo(() => lessonRows(progress), [progress]);

  const selectedId = params.get('lesson');
  const selected = rows.find((r) => r.lesson.id === selectedId && r.status !== 'locked') ?? null;

  function record(lesson: Lesson, result: LessonResult) {
    const next = recordAttempt(progress, lesson, result);
    setProgress(next);
    setSaveFailed(!saveProgress(next));
  }

  function open(id: string) {
    setParams({ lesson: id });
  }

  if (selected) {
    const next = nextLesson(selected.lesson.id);
    const nextRow = next ? rows.find((r) => r.lesson.id === next.id) : null;
    return (
      <div className="pb-16">
        <h1 className="pt-10 text-[1.6rem] font-semibold text-text">{t('learn:heading')}</h1>
        {layout !== 'qwerty' && <p className="mt-2 text-[0.9rem] text-sub">{t('learn:emulatedNote')}</p>}
        {saveFailed && (
          <p role="alert" className="mt-2 text-[0.9rem] text-error">
            {t('learn:lesson.loadError')}
          </p>
        )}
        <LessonView
          key={selected.lesson.id}
          row={selected}
          lang={lang}
          onRecord={record}
          onNext={nextRow && nextRow.status !== 'locked' ? () => open(nextRow.lesson.id) : null}
          onBack={() => setParams({})}
        />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <h1 className="pt-10 text-[1.6rem] font-semibold text-text">{t('learn:heading')}</h1>
      <p className="mt-2 max-w-[60ch] text-sub">{t('learn:intro')}</p>
      {layout !== 'qwerty' && <p className="mt-2 text-[0.9rem] text-sub">{t('learn:emulatedNote')}</p>}
      {saveFailed && (
        <p role="alert" className="mt-2 text-[0.9rem] text-error">
          {t('learn:lesson.loadError')}
        </p>
      )}

      <ol aria-label={t('learn:list.label')} className="mt-8 flex flex-col">
        {rows.map((row) => (
          <LessonItem key={row.lesson.id} row={row} lang={lang} onOpen={() => open(row.lesson.id)} />
        ))}
      </ol>
    </div>
  );
}

function LessonItem({ row, lang, onOpen }: { row: LessonRow; lang: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const { lesson, number, status, record, blockedBy } = row;
  const locked = status === 'locked';
  const keys = [...lesson.keys];
  const best = record && record.bestWpm > 0
    ? t('learn:best', {
        wpm: formatNumber(record.bestWpm, lang),
        acc: formatNumber(record.bestAcc, lang, 1),
      })
    : null;

  const body = (
    <>
      <span className="tabular w-8 shrink-0 text-right text-sub">{number}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn('text-[1rem]', locked ? 'text-sub' : 'text-text')}>
          {t(`learn:lessons.${lesson.id}.title`)}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {keys.length > 0
            ? keys.map((k) => <Kbd key={k}>{k}</Kbd>)
            : lesson.caps && <Kbd>{t('learn:shift')}</Kbd>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-right text-[0.85rem]">
        <span className={cn(status === 'passed' ? 'text-main' : 'text-sub')}>
          {t(`learn:status.${status}`)}
        </span>
        {best && <span className="tabular text-sub">{best}</span>}
      </span>
    </>
  );

  const rowClass = 'flex w-full items-center gap-4 border-t border-surface py-4 text-left';

  if (locked) {
    return (
      <li>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className={cn(rowClass, 'cursor-not-allowed opacity-60')}
        >
          {body}
        </button>
        {blockedBy !== null && (
          <p className="pb-3 pl-12 text-[0.85rem] text-sub">
            {t('learn:blocked', { number: blockedBy })}
          </p>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${number}. ${t(`learn:lessons.${lesson.id}.title`)}`}
        className={cn(rowClass, 'transition-colors hover:bg-surface/50')}
      >
        {body}
      </button>
    </li>
  );
}
