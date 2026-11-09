import { useTranslation } from 'react-i18next';
import { cn } from '@/components/cn';
import { ParrotHead } from '@/components/ParrotHead';
import type { RacePlayer } from './protocol';

export interface LocalProgress {
  /** The room's start time, so progress from an earlier race is ignored. */
  startsAt: number | null;
  chars: number;
  wpm: number;
}

export interface RaceLanesProps {
  players: readonly RacePlayer[];
  you: string | null;
  /** The racer's own live progress (smoother than the server's broadcast). */
  mine: LocalProgress | null;
  startsAt: number | null;
  textLength: number;
}

/** One lane per player: name and live wpm, then a thin track with a parrot head at progress. */
export function RaceLanes({ players, you, mine, startsAt, textLength }: RaceLanesProps) {
  const { t } = useTranslation();
  const localMine = mine && mine.startsAt === startsAt && textLength > 0 ? mine : null;

  return (
    <ol className="flex flex-col gap-3" aria-label={t('race:room.lanes')}>
      {players.map((p) => {
        const isYou = p.id === you;
        const progress = isYou && localMine ? localMine.chars / textLength : p.progress;
        const wpm = isYou && localMine ? localMine.wpm : p.wpm;
        const pct = Math.min(100, Math.max(0, progress * 100));
        return (
          <li
            key={p.id}
            className={cn(
              'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-4',
              !p.connected && 'opacity-50',
            )}
          >
            <div className="min-w-0">
              <div className={cn('truncate text-[0.95rem]', isYou ? 'text-text' : 'text-sub')} title={p.name}>
                {p.name}
                {isYou && <span className="ml-1.5 text-[0.85rem] text-sub">({t('race:room.you')})</span>}
              </div>
              <div className="text-[0.85rem] tabular-nums text-sub">{t('race:room.wpm', { value: Math.round(wpm) })}</div>
            </div>
            <div className="relative h-6">
              <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-surface" />
              <span
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 transition-[left] duration-100 ease-linear',
                  isYou ? 'text-caret' : 'text-sub',
                )}
                style={{ left: `calc(${pct}% - 9px)` }}
                data-testid="lane-mark"
                data-progress={pct.toFixed(1)}
              >
                <ParrotHead size={18} />
              </span>
            </div>
            <div className="text-right text-[0.95rem] tabular-nums text-text">
              {p.place !== null && <span aria-label={t('race:room.place', { place: p.place })}>{p.place}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
