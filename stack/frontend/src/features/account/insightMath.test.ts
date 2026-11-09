import { fillHistogram, histogramLabel, hourAlpha, hourLabel, maxTests } from './insightMath';

describe('fillHistogram', () => {
  it('fills the empty buckets between the first and last', () => {
    expect(
      fillHistogram([
        { from: 30, count: 2 },
        { from: 50, count: 1 },
      ]),
    ).toEqual([
      { from: 30, count: 2 },
      { from: 40, count: 0 },
      { from: 50, count: 1 },
    ]);
  });

  it('returns nothing for no results', () => {
    expect(fillHistogram([])).toEqual([]);
  });
});

describe('labels and alphas', () => {
  it('labels a wpm bucket as a range', () => {
    expect(histogramLabel(40)).toBe('40–49');
    expect(histogramLabel(0)).toBe('0–9');
  });

  it('scales the hour alpha by the test count', () => {
    expect(hourAlpha(0, 10)).toBe(0);
    expect(hourAlpha(10, 10)).toBe(1);
    expect(hourAlpha(1, 10)).toBeCloseTo(0.28);
  });

  it('finds the busiest hour and pads hour labels', () => {
    const hours = [
      { hour: 0, tests: 2, avgWpm: 50 },
      { hour: 1, tests: 7, avgWpm: 60 },
    ];
    expect(maxTests(hours)).toBe(7);
    expect(hourLabel(3)).toBe('03');
    expect(hourLabel(17)).toBe('17');
  });
});
