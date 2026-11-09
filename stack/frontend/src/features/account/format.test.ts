import { buildBestRows, movingAverage, relativeTime, splitDuration } from './format';
import { withAlpha } from './chartColors';

describe('movingAverage', () => {
  it('averages a trailing window and starts at the window size', () => {
    const out = movingAverage([10, 20, 30, 40], 3);
    expect(out).toEqual([null, null, 20, 30]);
  });

  it('uses 10 by default', () => {
    const values = Array.from({ length: 12 }, (_, i) => i + 1);
    const out = movingAverage(values);
    expect(out.slice(0, 9).every((v) => v === null)).toBe(true);
    expect(out[9]).toBeCloseTo(5.5);
    expect(out[11]).toBeCloseTo(7.5);
  });
});

describe('splitDuration', () => {
  it('splits milliseconds into hours and minutes', () => {
    expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 });
    expect(splitDuration(59_999)).toEqual({ hours: 0, minutes: 0 });
    expect(splitDuration((2 * 3600 + 14 * 60 + 5) * 1000)).toEqual({ hours: 2, minutes: 14 });
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  it('uses minutes and hours for recent results', () => {
    expect(relativeTime('2026-11-08T11:55:00Z', 'en', now)).toBe('5 minutes ago');
    expect(relativeTime('2026-11-08T09:00:00Z', 'en', now)).toBe('3 hours ago');
  });
  it('returns an empty string for invalid dates', () => {
    expect(relativeTime('nope', 'en', now)).toBe('');
  });
});

describe('buildBestRows', () => {
  it('lists every time option, with dashes where there is no result', () => {
    const rows = buildBestRows([
      { mode: 'time', mode2: '60', language: 'en', wpm: 80, accuracy: 97, createdAt: '2026-01-01T00:00:00Z' },
      { mode: 'time', mode2: '60', language: 'pl', wpm: 60, accuracy: 95, createdAt: '2026-01-02T00:00:00Z' },
    ]);
    const time = rows.filter((r) => r.mode === 'time');
    expect(time.map((r) => r.mode2)).toEqual(['15', '30', '60', '60', '120']);
    expect(time.find((r) => r.mode2 === '15')?.best).toBeNull();
    expect(time.filter((r) => r.mode2 === '60').map((r) => r.best?.language)).toEqual(['en', 'pl']);
    expect(rows.filter((r) => r.mode === 'words')).toHaveLength(4);
  });

  it('shows one dash row for modes without results and lists the rest', () => {
    const rows = buildBestRows([]);
    expect(rows.filter((r) => r.mode === 'quote')).toEqual([{ mode: 'quote', mode2: null, best: null }]);
    expect(rows.every((r) => r.best === null)).toBe(true);
  });
});

describe('withAlpha', () => {
  it('converts hex to rgba', () => {
    expect(withAlpha('#6f7562', 0.5)).toBe('rgba(111, 117, 98, 0.5)');
    expect(withAlpha('#fff', 0.2)).toBe('rgba(255, 255, 255, 0.2)');
  });
  it('converts rgb() and leaves other values alone', () => {
    expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgba(1, 2, 3, 0.5)');
    expect(withAlpha('red', 0.5)).toBe('red');
  });
});
