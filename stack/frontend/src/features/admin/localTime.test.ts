import { fromLocalInput, localNow, toLocalInput } from './localTime';

describe('localTime', () => {
  it('shows an instant in local time and reads the value back as the same instant', () => {
    const iso = new Date(2026, 10, 9, 14, 30).toISOString();
    expect(toLocalInput(iso)).toBe('2026-11-09T14:30');
    expect(fromLocalInput('2026-11-09T14:30')).toBe(iso);
  });

  it('returns empty and null for missing or invalid values', () => {
    expect(toLocalInput('not a date')).toBe('');
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('2026-13-40T99:99')).toBeNull();
  });

  it('formats now as a local value without seconds', () => {
    expect(localNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
