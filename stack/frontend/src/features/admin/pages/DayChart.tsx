import { useMemo } from 'react';
import { CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import { useChartPalette } from '@/features/account/useChartPalette';
import { withAlpha } from '@/features/account/chartColors';
import type { DayCount } from '@/lib/api/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

/** A 30-day line chart for one daily count. Colours come from the theme tokens. */
export function DayChart({ title, data }: { title: string; data: DayCount[] }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const palette = useChartPalette();

  const chart = useMemo(() => {
    const label = new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return {
      labels: data.map((d) => label.format(new Date(`${d.date}T00:00:00Z`))),
      datasets: [
        {
          label: title,
          data: data.map((d) => d.count),
          borderColor: palette.main,
          backgroundColor: withAlpha(palette.main, 0.12),
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 2,
          tension: 0.3,
        },
      ],
    };
  }, [data, lang, palette, title]);

  return (
    <div className="h-48" role="img" aria-label={title}>
      <Line
        data={chart}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: palette.sub, maxTicksLimit: 6 }, grid: { display: false } },
            y: {
              beginAtZero: true,
              ticks: { color: palette.sub, precision: 0 },
              grid: { color: withAlpha(palette.sub, 0.15) },
            },
          },
        }}
      />
    </div>
  );
}
