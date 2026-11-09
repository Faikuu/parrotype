import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import { useReducedMotion } from '@/components/useMediaQuery';
import type { EngineEvent, EngineState, TestConfig } from '@/lib/engine/types';
import { Words } from './Words';
import { createReplayCursor, eventCountAt, replayLength } from './replayCursor';

const SPEEDS = [0.5, 1, 2] as const;
type Speed = (typeof SPEEDS)[number];

/** Round icon button, the same as the results actions. */
const ROUND_BUTTON =
  'grid size-11 shrink-0 place-items-center rounded-full border border-surface bg-transparent text-sub transition-colors hover:bg-surface hover:text-text disabled:pointer-events-none disabled:opacity-50';

const noop = () => undefined;

/** The text view. Memoised on the state object, so playback frames that don't change the state skip it. */
const ReplayView = memo(function ReplayView({ state, smooth }: { state: EngineState; smooth: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <Words state={state} onActivate={noop} pace={null} caretSmooth={smooth} />
    </div>
  );
});

export interface ReplayPlayerProps {
  config: TestConfig;
  /** The target words of the finished test (for time mode, including the words appended while typing). */
  words: readonly string[];
  events: readonly EngineEvent[];
  /** The live state when the test finished. Shown once the playhead reaches the end. */
  final: EngineState;
}

/**
 * Plays a finished test back keystroke by keystroke, driven by the event log. The playhead moves on
 * requestAnimationFrame; the state is recomputed only when the number of events passed changes.
 */
export function ReplayPlayer({ config, words, events, final }: ReplayPlayerProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const duration = replayLength(final, events);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [pos, setPos] = useState(0);
  // The playhead, mirrored in a ref so the frame loop can read it without re-subscribing every frame.
  const posRef = useRef(0);

  const cursor = useMemo(() => createReplayCursor(config, words, events), [config, words, events]);

  const seek = useCallback(
    (ms: number) => {
      const next = Math.max(0, Math.min(duration, ms));
      posRef.current = next;
      setPos(next);
    },
    [duration],
  );

  // Playback: advance by the elapsed frame time times the speed, and stop at the end.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last === null ? 0 : now - last;
      last = now;
      const next = Math.min(duration, posRef.current + dt * speed);
      posRef.current = next;
      setPos(next);
      if (next >= duration) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, duration]);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (duration === 0) return;
    // At the end, play starts again from the top.
    if (posRef.current >= duration) seek(0);
    setPlaying(true);
  }

  // At the end the live final state is shown (for a time test ended by the timer, the replay alone would not be finished).
  const atEnd = pos >= duration;
  const shown = atEnd ? final : cursor.at(eventCountAt(events, pos));

  const elapsed = (pos / 1000).toFixed(1);
  const total = (duration / 1000).toFixed(1);

  return (
    <section aria-label={t('replay.title')} className="flex flex-col gap-4 rounded-[10px] bg-surface/60 p-4">
      <ReplayView state={shown} smooth={!reduceMotion} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={duration === 0}
          aria-label={playing ? t('replay.pause') : t('replay.play')}
          title={playing ? t('replay.pause') : t('replay.play')}
          className={ROUND_BUTTON}
        >
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>

        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={Math.round(pos)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label={t('replay.scrub')}
          aria-valuetext={t('replay.time', { elapsed, total })}
          disabled={duration === 0}
          className="min-w-[8rem] flex-1 accent-main"
        />

        <span className="tabular whitespace-nowrap text-[0.85rem] text-sub">
          {t('replay.time', { elapsed, total })}
        </span>

        <div role="group" aria-label={t('replay.speed')} className="flex items-center gap-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className="rounded-[6px] px-2 py-1 text-[0.85rem] tabular text-sub transition-colors hover:text-text aria-pressed:text-main"
            >
              {t('replay.speedValue', { speed: s })}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
