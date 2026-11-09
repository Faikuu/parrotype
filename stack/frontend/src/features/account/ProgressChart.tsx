import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import type { Result } from '@/lib/api/types';
import { readChartPalette, withAlpha, type ChartPalette } from './chartColors';
import { formatDateTime, movingAverage } from './format';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

/** Results are newest first; the chart draws them oldest to newest. */
export function ProgressChart({ results }: { results: Result[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const theme = useSettings((s) => s.theme);
  const preview = useUi((s) => s.previewTheme);

  // Theme vars are written by an effect in the app root, which runs after this component's
  // effects. A frame later they are guaranteed to be applied, so read the palette then.
  const [palette, setPalette] = useState<ChartPalette>(readChartPalette);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPalette(readChartPalette()));
    return () => cancelAnimationFrame(id);
  }, [theme, preview]);

  const data = useMemo(() => {
    const series = [...results].reverse();
    const wpm = series.map((r) => r.wpm);
    return {
      labels: series.map((r) => formatDateTime(r.createdAt, lang)),
      datasets: [
        {
          label: t('account:progress.perTest'),
          data: wpm,
          showLine: false,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          pointBackgroundColor: withAlpha(palette.sub, 0.5),
          pointBorderWidth: 0,
          borderColor: 'transparent',
          borderWidth: 0,
        },
        {
          label: t('account:progress.average'),
          data: movingAverage(wpm, 10),
          borderColor: palette.main,
          backgroundColor: palette.main,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 2,
          tension: 0.25,
          spanGaps: false,
        },
      ],
    };
  }, [results, palette, lang, t]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'top' as const,
          align: 'start' as const,
          labels: {
            color: palette.sub,
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: 'circle' as const,
          },
        },
        tooltip: {
          backgroundColor: palette.surface,
          titleColor: palette.text,
          bodyColor: palette.text,
          borderWidth: 0,
          padding: 10,
          cornerRadius: 6,
          displayColors: false,
        },
      },
      scales: {
        x: { display: false, grid: { display: false } },
        y: {
          grid: { color: palette.surface },
          border: { display: false },
          ticks: { color: palette.sub, maxTicksLimit: 6 },
        },
      },
    }),
    [palette],
  );

  return (
    <div className="h-[280px] w-full" role="img" aria-label={t('account:progress.label')}>
      <Line data={data} options={options} />
    </div>
  );
}
