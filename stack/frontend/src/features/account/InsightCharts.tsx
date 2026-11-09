import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { HistogramBucket, HourBucket } from '@/lib/api/types';
import { withAlpha, type ChartPalette } from './chartColors';
import { fillHistogram, histogramLabel, hourAlpha, hourLabel, maxTests } from './insightMath';
import { useChartPalette } from './useChartPalette';

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/** The shared look: bars in --main, a faint grid in --surface, ticks in --sub. */
function barOptions(palette: ChartPalette, tooltipLabel: (index: number) => string | null) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: palette.surface,
        titleColor: palette.text,
        bodyColor: palette.text,
        borderWidth: 0,
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: (ctx: { dataIndex: number }) => tooltipLabel(ctx.dataIndex) ?? '',
          title: () => '',
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: palette.sub, maxRotation: 0, autoSkipPadding: 8 },
      },
      y: {
        beginAtZero: true,
        grid: { color: palette.surface },
        border: { display: false },
        ticks: { color: palette.sub, precision: 0, maxTicksLimit: 5 },
      },
    },
  };
}

/** Test counts per 10 wpm range. */
export function WpmHistogram({ buckets }: { buckets: HistogramBucket[] }) {
  const { t } = useTranslation();
  const palette = useChartPalette();
  const filled = useMemo(() => fillHistogram(buckets), [buckets]);

  const data = useMemo(
    () => ({
      labels: filled.map((b) => histogramLabel(b.from)),
      datasets: [
        {
          data: filled.map((b) => b.count),
          backgroundColor: palette.main,
          borderRadius: 2,
          maxBarThickness: 32,
        },
      ],
    }),
    [filled, palette],
  );

  const options = useMemo(
    () =>
      barOptions(palette, (i) => {
        const count = filled[i]?.count ?? 0;
        return t('insights:histogram.count', { count });
      }),
    [filled, palette, t],
  );

  return (
    <div className="h-[220px] w-full" role="img" aria-label={t('insights:histogram.label')}>
      <Bar data={data} options={options} />
    </div>
  );
}

/** Average wpm per UTC hour. Bars are more opaque where there are more tests. */
export function HourChart({ hours }: { hours: HourBucket[] }) {
  const { t } = useTranslation();
  const palette = useChartPalette();
  const busiest = maxTests(hours);

  const data = useMemo(
    () => ({
      labels: hours.map((h) => hourLabel(h.hour)),
      datasets: [
        {
          data: hours.map((h) => h.avgWpm),
          backgroundColor: hours.map((h) => withAlpha(palette.main, hourAlpha(h.tests, busiest))),
          borderRadius: 2,
          maxBarThickness: 24,
        },
      ],
    }),
    [hours, palette, busiest],
  );

  const options = useMemo(
    () =>
      barOptions(palette, (i) => {
        const h = hours[i];
        if (!h || h.tests === 0) return t('insights:byHour.none');
        return t('insights:byHour.tooltip', { count: h.tests, wpm: h.avgWpm });
      }),
    [hours, palette, t],
  );

  return (
    <div className="h-[200px] w-full" role="img" aria-label={t('insights:byHour.label')}>
      <Bar data={data} options={options} />
    </div>
  );
}
