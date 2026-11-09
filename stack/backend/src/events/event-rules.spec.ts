import { EVENT_MAX_DURATION_MS, eventEditProblem, eventState, eventWindowProblem, hasStarted } from './event-rules';

const at = (iso: string) => new Date(iso);
const START = at('2026-12-01T10:00:00Z');
const END = at('2026-12-01T11:00:00Z');
const BEFORE = at('2026-12-01T09:59:59Z');
const DURING = at('2026-12-01T10:30:00Z');

describe('eventWindowProblem', () => {
  it('accepts an end after the start', () => {
    expect(eventWindowProblem(START, END)).toBeNull();
  });

  it('refuses an end equal to or before the start', () => {
    expect(eventWindowProblem(START, START)).toBe('endsAt must be after startsAt');
    expect(eventWindowProblem(START, at('2026-12-01T09:00:00Z'))).toBe('endsAt must be after startsAt');
  });

  it('accepts exactly 30 days and refuses a longer duration', () => {
    const thirty = new Date(START.getTime() + EVENT_MAX_DURATION_MS);
    expect(eventWindowProblem(START, thirty)).toBeNull();
    const over = new Date(thirty.getTime() + 1);
    expect(eventWindowProblem(START, over)).toBe('the window may last at most 30 days');
  });
});

describe('eventState and hasStarted', () => {
  it('is upcoming before the start, active from the start until the end, past from the end', () => {
    expect(eventState(START, END, BEFORE)).toBe('upcoming');
    expect(eventState(START, END, START)).toBe('active');
    expect(eventState(START, END, DURING)).toBe('active');
    expect(eventState(START, END, END)).toBe('past');
  });

  it('has started exactly at startsAt', () => {
    expect(hasStarted(START, BEFORE)).toBe(false);
    expect(hasStarted(START, START)).toBe(true);
  });
});

describe('eventEditProblem before the start', () => {
  const current = { startsAt: START, endsAt: END, language: 'en', text: 'the quick brown fox jumps over' };

  it('lets every field change within the window rules', () => {
    expect(eventEditProblem(current, { text: 'a new text of enough length', language: 'de', startsAt: BEFORE, endsAt: at('2026-12-02T00:00:00Z') }, BEFORE)).toBeNull();
  });

  it('still checks the window on the merged values', () => {
    // Moving the start past the stored end (and not touching endsAt) must fail.
    expect(eventEditProblem(current, { startsAt: at('2026-12-01T12:00:00Z') }, BEFORE)).toBe('endsAt must be after startsAt');
  });
});

describe('eventEditProblem once started', () => {
  const current = { startsAt: START, endsAt: END, language: 'en', text: 'the quick brown fox jumps over' };

  it('refuses a changed text (400)', () => {
    expect(eventEditProblem(current, { text: 'a completely different text' }, DURING)).toBe(
      'the text of a started event cannot change',
    );
  });

  it('refuses a changed language (400)', () => {
    expect(eventEditProblem(current, { language: 'pl' }, DURING)).toBe('the language of a started event cannot change');
  });

  it('accepts the same text and language again (no change)', () => {
    expect(eventEditProblem(current, { text: current.text, language: 'en' }, DURING)).toBeNull();
  });

  it('allows the title and description, which are not part of this rule', () => {
    expect(eventEditProblem(current, {}, DURING)).toBeNull();
  });

  it('allows extending endsAt, and refuses shortening it', () => {
    expect(eventEditProblem(current, { endsAt: at('2026-12-03T00:00:00Z') }, DURING)).toBeNull();
    expect(eventEditProblem(current, { endsAt: at('2026-12-01T10:45:00Z') }, DURING)).toBe(
      'a started event can only be extended, not shortened',
    );
  });

  it('refuses a changed start (400)', () => {
    expect(eventEditProblem(current, { startsAt: at('2026-12-01T10:05:00Z') }, DURING)).toBe(
      'the start of a started event cannot change',
    );
  });
});
