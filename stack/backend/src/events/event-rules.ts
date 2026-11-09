import { DAY_MS, windowProblem } from '../common/time-window';

/** Longest an event may run (endsAt - startsAt). */
export const EVENT_MAX_DURATION_MS = 30 * DAY_MS;

export type EventState = 'upcoming' | 'active' | 'past';

/** An event has started once now reaches startsAt. From then on its text and language are fixed. */
export function hasStarted(startsAt: Date, now: Date): boolean {
  return now.getTime() >= startsAt.getTime();
}

/** upcoming before startsAt, active from startsAt until endsAt, past from endsAt on. */
export function eventState(startsAt: Date, endsAt: Date, now: Date): EventState {
  if (!hasStarted(startsAt, now)) return 'upcoming';
  return now.getTime() < endsAt.getTime() ? 'active' : 'past';
}

/** Why the event window is not allowed (endsAt after startsAt, at most 30 days), or null. */
export function eventWindowProblem(startsAt: Date, endsAt: Date): string | null {
  return windowProblem(startsAt, endsAt, EVENT_MAX_DURATION_MS);
}

export interface EventSnapshot {
  startsAt: Date;
  endsAt: Date;
  language: string;
  text: string;
}

export interface EventEdit {
  language?: string;
  text?: string;
  startsAt?: Date;
  endsAt?: Date;
}

/**
 * Why an edit of an existing event is refused, or null. Before the start, every field may change within the
 * window rules. Once started: the text, the language and the start are fixed (400), and endsAt can only move
 * later (extend only). The title and description are not part of this rule.
 */
export function eventEditProblem(current: EventSnapshot, edit: EventEdit, now: Date): string | null {
  if (hasStarted(current.startsAt, now)) {
    if (edit.text !== undefined && edit.text !== current.text) return 'the text of a started event cannot change';
    if (edit.language !== undefined && edit.language !== current.language) return 'the language of a started event cannot change';
    if (edit.startsAt !== undefined && edit.startsAt.getTime() !== current.startsAt.getTime()) {
      return 'the start of a started event cannot change';
    }
    if (edit.endsAt !== undefined && edit.endsAt.getTime() < current.endsAt.getTime()) {
      return 'a started event can only be extended, not shortened';
    }
  }
  return eventWindowProblem(edit.startsAt ?? current.startsAt, edit.endsAt ?? current.endsAt);
}
