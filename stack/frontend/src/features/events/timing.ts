import type { EventState } from '@/lib/api/types';

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Splits a time left into days and clock parts. Partial seconds round up, so the last second reads 00:00:01. */
export function splitCountdown(ms: number): Countdown {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The clock part: HH:MM:SS. The days are shown separately (see countdownText). */
export function formatClock(c: Countdown): string {
  return `${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
}

/** "02:03:11", or "1 d 02:03:11" from a day up. `daysText` formats the day count (it is translated). */
export function countdownText(ms: number, daysText: (n: number) => string): string {
  const c = splitCountdown(ms);
  const clock = formatClock(c);
  return c.days > 0 ? `${daysText(c.days)} ${clock}` : clock;
}

/** The state of an event at `now`, in the same terms as the server (startsAt <= now < endsAt is active). */
export function stateAt(startsAt: string, endsAt: string, now: number): EventState {
  if (now < Date.parse(startsAt)) return 'upcoming';
  if (now < Date.parse(endsAt)) return 'active';
  return 'past';
}
