import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/components/cn';
import { computeResult } from '@/lib/engine/stats';
import { timeLeftMs } from '@/lib/engine/engine';
import type { EngineState } from '@/lib/engine/types';
import { useSettings } from '@/store/settings';

/** A timestamp that updates every 100ms while active. Only the live stats re-render with it. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function LiveStats({ state }: { state: EngineState }) {
  const { t } = useTranslation();
  const liveStats = useSettings((s) => s.liveStats);
  const running = state.status === 'running';
  const now = useNow(running);

  let progress: string;
  if (state.config.mode === 'time') {
    progress = String(Math.ceil((timeLeftMs(state, now) ?? 0) / 1000));
  } else if (state.config.mode === 'zen') {
    progress = t('settings:wordCount', { count: state.current });
  } else {
    progress = `${state.current}/${state.words.length}`;
  }

  const live = running ? computeResult({ ...state, finishedAt: now }) : null;
  const showWpm = liveStats === 'wpm' || liveStats === 'both';
  const showAcc = liveStats === 'acc' || liveStats === 'both';

  return (
    <div
      className={cn(
        'flex min-h-[2.4rem] items-baseline gap-6 text-main tabular-nums',
        !running && 'invisible',
      )}
      aria-hidden={!running}
    >
      <span className="text-[1.6rem] leading-none" aria-label={state.config.mode === 'time' ? t('test:secondsLeft') : t('test:wordsTyped')}>
        {progress}
      </span>
      {live && showWpm && (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[1.6rem] leading-none">{Math.round(live.wpm)}</span>
          <span className="text-[0.85rem] text-sub">{t('test:wpm')}</span>
        </span>
      )}
      {live && showAcc && (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[1.6rem] leading-none">{Math.round(live.accuracy)}%</span>
          <span className="text-[0.85rem] text-sub">{t('test:acc')}</span>
        </span>
      )}
    </div>
  );
}
