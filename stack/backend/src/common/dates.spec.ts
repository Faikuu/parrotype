import { utcDate } from './dates';

describe('utcDate', () => {
  const at = (iso: string) => Date.parse(iso);

  it('returns the UTC calendar date of the given instant', () => {
    expect(utcDate(0, at('2026-11-08T00:00:00Z'))).toBe('2026-11-08');
    expect(utcDate(0, at('2026-11-08T23:59:59.999Z'))).toBe('2026-11-08');
  });

  it('offsets by whole days', () => {
    const now = at('2026-11-08T12:00:00Z');
    expect(utcDate(-1, now)).toBe('2026-11-07');
    expect(utcDate(1, now)).toBe('2026-11-09');
    expect(utcDate(-2, now)).toBe('2026-11-06');
  });

  it('crosses month and year boundaries', () => {
    expect(utcDate(1, at('2026-11-30T12:00:00Z'))).toBe('2026-12-01');
    expect(utcDate(-1, at('2027-01-01T00:30:00Z'))).toBe('2026-12-31');
  });

  it('handles leap days', () => {
    expect(utcDate(1, at('2028-02-28T12:00:00Z'))).toBe('2028-02-29');
    expect(utcDate(1, at('2027-02-28T12:00:00Z'))).toBe('2027-03-01');
  });

  it('uses the current clock by default (fake timers)', () => {
    jest.useFakeTimers({ now: at('2026-11-08T06:00:00Z') });
    try {
      expect(utcDate()).toBe('2026-11-08');
      expect(utcDate(-1)).toBe('2026-11-07');
    } finally {
      jest.useRealTimers();
    }
  });
});
