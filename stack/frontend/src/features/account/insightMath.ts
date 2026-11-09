import type { HistogramBucket, HourBucket } from '@/lib/api/types';

/** Pure helpers for the insight charts. */

export const WPM_BUCKET = 10;

/** Fills the gaps between the first and last bucket with zero counts, so the x axis is continuous. */
export function fillHistogram(buckets: readonly HistogramBucket[]): HistogramBucket[] {
  if (buckets.length === 0) return [];
  const counts = new Map(buckets.map((b) => [b.from, b.count]));
  const first = Math.min(...buckets.map((b) => b.from));
  const last = Math.max(...buckets.map((b) => b.from));
  const out: HistogramBucket[] = [];
  for (let from = first; from <= last; from += WPM_BUCKET) {
    out.push({ from, count: counts.get(from) ?? 0 });
  }
  return out;
}

/** "40–49": the range label of a bucket. */
export function histogramLabel(from: number): string {
  return `${from}–${from + WPM_BUCKET - 1}`;
}

/** Bar opacity for the by-hour chart: 0.2 for the quietest hour with tests, 1 for the busiest, 0 for none. */
export function hourAlpha(tests: number, maxTests: number): number {
  if (tests <= 0 || maxTests <= 0) return 0;
  return 0.2 + 0.8 * (tests / maxTests);
}

export function maxTests(hours: readonly HourBucket[]): number {
  return hours.reduce((max, h) => Math.max(max, h.tests), 0);
}

/** "00", "01", ... "23". */
export function hourLabel(hour: number): string {
  return String(hour).padStart(2, '0');
}
