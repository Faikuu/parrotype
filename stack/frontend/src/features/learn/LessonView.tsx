import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Kbd } from '@/components/Kbd';
import { formatNumber } from '@/features/account/format';
import { TypingArea } from '@/features/race/TypingArea';
import { OnScreenKeyboard } from '@/components/OnScreenKeyboard';
import { lessonWords, type Lesson } from '@/lib/text/lessons';
import { useSettings } from '@/store/settings';
import { passes, type LessonResult, type LessonRow } from './progress';

/** Words per attempt. */
const WORDS_PER_ATTEMPT = 30;

interface LessonViewProps {
  row: LessonRow;
  lang: string;
  onRecord: (lesson: Lesson, result: LessonResult) => void;
  /** Opens the next lesson when it is unlocked (a passed lesson only). */
  onNext: (() => void) | null;
  onBack: () => void;
}

/** A lesson: its keys, a typing area of its words, and the result against the goals. */
export function LessonView({ row, lang, onRecord, onNext, onBack }: LessonViewProps) {
  const { t } = useTranslation();
  const { lesson } = row;
  // Each attempt has its own text and key, so the typing area starts fresh on a replay.
  const [attempt, setAttempt] = useState(() => ({ key: 0, text: attemptText(lesson) }));
  const [result, setResult] = useState<LessonResult | null>(null);
  // Correct characters typed so far: the keyboard highlights the next one of the text.
  const [correctChars, setCorrectChars] = useState(0);
  const layout = useSettings((s) => s.layout);
  const hints = useSettings((s) => s.keyboardHints);
  const { text } = attempt;
  const nextChar = correctChars < text.length ? text.charAt(correctChars) : null;
  const passed = result !== null && passes(lesson, result);

  const fmt = (n: number, digits = 0) => formatNumber(n, lang, digits);
  const keys = [...lesson.keys];

  return (
    <section aria-labelledby="lesson-title" className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-[0.95rem] text-sub hover:text-text">
          {t('learn:lesson.back')}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 id="lesson-title" className="text-[1.3rem] font-semibold text-text">
          {t(`learn:lessons.${lesson.id}.title`)}
        </h2>
        <p className="flex flex-wrap items-center gap-1.5 text-text">
          {keys.length > 0 ? (
            <>
              <span>{t('learn:lesson.newKeys')}</span>
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </>
          ) : (
            <span>{t('learn:lesson.noNewKeys')}</span>
          )}
        </p>
        <p className="text-sub">{t(`learn:lessons.${lesson.id}.hint`)}</p>
        {lesson.caps && <p className="text-sub">{t('learn:lesson.caps')}</p>}
        <p className="text-[0.9rem] text-sub">{t('learn:lesson.goal', { wpm: lesson.goalWpm, acc: lesson.goalAcc })}</p>
      </div>

      <div className="rounded-[10px] bg-surface/40 p-5">
        <TypingArea
          key={attempt.key}
          text={text}
          open={result === null}
          onChange={(chars) => setCorrectChars(chars)}
          onFinish={(r) => {
            const next = { wpm: r.wpm, accuracy: r.accuracy };
            setResult(next);
            onRecord(lesson, next);
          }}
        />
      </div>

      {result === null && <OnScreenKeyboard layout={layout} next={nextChar} hints={hints} />}

      {result && (
        <div role="status" className="flex flex-col gap-4 rounded-[10px] bg-surface/60 p-5">
          <p className={passed ? 'text-main' : 'text-text'}>
            {passed
              ? t('learn:lesson.passed', { wpm: fmt(result.wpm), acc: fmt(result.accuracy, 1) })
              : t('learn:lesson.failed', { wpm: fmt(result.wpm), acc: fmt(result.accuracy, 1) })}
          </p>
          <div className="flex flex-wrap gap-3">
            {passed && onNext && <Button onClick={onNext}>{t('learn:lesson.next')}</Button>}
            {passed && !onNext && <p className="text-sub">{t('learn:lesson.lastDone')}</p>}
            <Button
              variant={passed ? 'ghost' : 'primary'}
              onClick={() => {
                setResult(null);
                setCorrectChars(0);
                setAttempt((a) => ({ key: a.key + 1, text: attemptText(lesson) }));
              }}
            >
              {passed ? t('learn:lesson.replay') : t('learn:lesson.tryAgain')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function attemptText(lesson: Lesson): string {
  return lessonWords(lesson, WORDS_PER_ATTEMPT).join(' ');
}

