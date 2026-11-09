import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CategoryScale, Chart as ChartJS, LineController, LineElement, LinearScale, PointElement, ScatterController, Tooltip, type ChartData, type ChartOptions } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { ChevronRight, Copy, PlayCircle, RotateCcw } from 'lucide-react';
import { slowestWords } from '@/lib/engine/timings';
import type { EngineState, TestConfig } from '@/lib/engine/types';
import { foldKeyStats } from '@/store/keyStats';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { KeyHeatmap } from './KeyHeatmap';
import { ReplayPlayer } from './ReplayPlayer';
import { SlowestWords } from './SlowestWords';
import { copyText, summaryText } from './copySummary';
import { practiceText } from './practice';
import type { FinishedResult, SaveState } from './useTypingTest';

ChartJS.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, ScatterController, Tooltip);

/** Round icon buttons: quiet until hovered, but still visible against the page background. */
const ACTION_BUTTON =
  'grid size-11 place-items-center rounded-full border border-surface bg-transparent text-sub transition-colors hover:bg-surface hover:text-text';

interface Palette {
  main: string;
  sub: string;
  text: string;
  surface: string;
  error: string;
  font: string;
}

/** Reads the theme tokens. Call after the theme has been applied to <html>. */
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    main: get('--main', '#9db35f'),
    sub: get('--sub', '#888888'),
    text: get('--text', '#dddddd'),
    surface: get('--surface', '#333333'),
    error: get('--error', '#e0525a'),
    font: get('--font-ui', 'sans-serif'),
  };
}

/**
 * Palette that follows the theme. The theme is applied in an effect that runs after this one,
 * so the read waits one frame.
 */
function usePalette(): Palette {
  const theme = useSettings((s) => s.theme);
  const customTheme = useSettings((s) => s.customTheme);
  const preview = useUi((s) => s.previewTheme);
  const draft = useUi((s) => s.themeDraft);
  const [palette, setPalette] = useState<Palette>(readPalette);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPalette(readPalette()));
    return () => cancelAnimationFrame(id);
  }, [theme, customTheme, preview, draft]);
  return palette;
}

function testLabel(cfg: TestConfig, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const mode = t(`settings:modes.${cfg.mode}`).toLowerCase();
  let value = '';
  switch (cfg.mode) {
    case 'time':
      value = String(cfg.time);
      break;
    case 'words':
      value = String(cfg.words);
      break;
    case 'quote':
      value = t(`settings:quoteLengths.${cfg.quoteLength}`).toLowerCase();
      break;
    case 'pangram':
      value = String(cfg.pangramCount);
      break;
    default:
      break;
  }
  return [
    mode,
    value,
    cfg.language,
    cfg.punctuation ? t('results:punctuationOn') : '',
    cfg.numbers ? t('results:numbersOn') : '',
  ]
    .filter((p) => p.length > 0)
    .join(' ');
}

function Stat({ label, value, title, muted }: { label: string; value: string; title?: string; muted?: boolean }) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-[0.85rem] text-sub">{label}</dt>
      <dd className={`m-0 text-[1.1rem] tabular-nums ${muted ? 'text-sub' : 'text-text'}`}>{value}</dd>
    </div>
  );
}

interface ResultsProps {
  config: TestConfig;
  result: FinishedResult;
  /** The engine state at the finish. Its event log drives the replay, and its words feed the slowest-words list. */
  state: EngineState;
  /** UTC date of a daily test (for the copied summary). */
  date: string;
  saveState: SaveState;
  onNext: () => void;
  onRepeat: () => void;
}

/** How long "Copied" stays after a copy. */
const COPIED_MS = 2000;

export function Results({ config, result, state, date, saveState, onNext, onRepeat }: ResultsProps) {
  const { t } = useTranslation();
  const palette = usePalette();
  const samples = result.samples;
  const { correct, incorrect, extra, missed } = result.charStats;
  const [copied, setCopied] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const missedKeys = useMemo(() => foldKeyStats(result.keyStats, config.language), [result.keyStats, config.language]);
  const hasKeys = Object.keys(missedKeys).length > 0;
  const slowest = useMemo(() => slowestWords(state, 5), [state]);
  const hasEvents = state.events.length > 0;
  const failed = result.failed;

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  async function onCopy() {
    const ok = await copyText(summaryText(config, result, date));
    setCopied(ok);
  }

  const chart = useMemo(() => {
    const labels = samples.map((s) => String(s.second));
    const maxErrors = samples.reduce((m, s) => Math.max(m, s.errors), 0);
    const family = palette.font;
    const errorPoints = samples.flatMap((s, i) => (s.errors > 0 ? [{ x: i, y: s.errors }] : []));

    // Mixed line + scatter. The scatter is typed loosely because chart.js's line type does not list it.
    const data = {
      labels,
      datasets: [
        {
          label: t('results:chartWpm'),
          data: samples.map((s) => s.wpm),
          borderColor: palette.main,
          backgroundColor: palette.main,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.25,
        },
        {
          label: t('results:chartRaw'),
          data: samples.map((s) => s.raw),
          borderColor: palette.sub,
          backgroundColor: palette.sub,
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.25,
        },
        {
          type: 'scatter',
          label: t('results:chartErrors'),
          data: errorPoints,
          pointStyle: 'crossRot',
          pointRadius: 5,
          borderWidth: 2,
          borderColor: palette.error,
          backgroundColor: palette.error,
          yAxisID: 'y1',
        },
      ],
    } as unknown as ChartData<'line'>;

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: palette.surface,
          titleColor: palette.text,
          bodyColor: palette.text,
          borderWidth: 0,
          padding: 10,
          displayColors: false,
          titleFont: { family, size: 12 },
          bodyFont: { family, size: 12 },
          filter: (item) => item.datasetIndex < 2,
          callbacks: {
            title: (items) => {
              const s = samples[items[0]?.dataIndex ?? -1];
              return s ? t('results:chartSecond', { second: s.second }) : '';
            },
            label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}`,
            afterBody: (items) => {
              const s = samples[items[0]?.dataIndex ?? -1];
              return s ? `${t('results:chartErrors')}: ${s.errors}` : '';
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: palette.sub, font: { family, size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: palette.surface },
          border: { display: false },
          ticks: { color: palette.sub, font: { family, size: 11 } },
        },
        y1: {
          display: false,
          min: 0,
          max: Math.max(3, maxErrors * 3),
        },
      },
    };
    return { data, options };
  }, [samples, palette, t]);

  const acc = Math.round(result.accuracy);
  const seconds = (result.durationMs / 1000).toFixed(1);

  // Custom text made from the slow words, then a restart in custom mode.
  function practice() {
    useSettings.getState().setMany({ customText: practiceText(slowest.map((w) => w.word)), mode: 'custom' });
    useUi.getState().restart();
  }

  return (
    <section aria-label={t('results:title')} className="flex flex-col gap-8 py-2">
      <div className="grid items-center gap-8 md:grid-cols-[minmax(0,12rem)_1fr]">
        <div className="flex flex-col gap-3">
          {failed ? (
            <p role="status" className="m-0 text-[2rem] leading-tight text-error">
              {t('results:failedAt', { word: state.current + 1 })}
            </p>
          ) : null}
          <dl className="flex gap-8 md:flex-col md:gap-4">
            <div>
              {failed ? (
                <dd className="m-0 text-[1.6rem] leading-none tabular-nums text-sub">{Math.round(result.wpm)}</dd>
              ) : (
                <dd className="m-0 text-[5rem] leading-none tabular-nums text-main">{Math.round(result.wpm)}</dd>
              )}
              <dt className="mt-1 text-[0.85rem] text-sub">{t('results:wpm')}</dt>
            </div>
            <div>
              {failed ? (
                <dd className="m-0 text-[1.6rem] leading-none tabular-nums text-sub">{acc}%</dd>
              ) : (
                <dd className="m-0 text-[2.5rem] leading-none tabular-nums text-main">{acc}%</dd>
              )}
              <dt className="mt-1 text-[0.85rem] text-sub">{t('results:acc')}</dt>
            </div>
          </dl>
          {result.isPersonalBest && (
            <p role="status" className="m-0 text-[0.9rem] text-caret">
              {t('results:personalBest')}
            </p>
          )}
        </div>

        <div className="relative h-[15rem] min-w-0" role="img" aria-label={t('results:chartLabel')}>
          {samples.length > 0 ? (
            <Chart type="line" data={chart.data} options={chart.options} />
          ) : (
            <p className="text-sub">{t('results:chartEmpty')}</p>
          )}
        </div>
      </div>

      {replayOpen && hasEvents && (
        <div id="replay-panel">
          <ReplayPlayer config={state.config} words={state.words} events={state.events} final={state} />
        </div>
      )}

      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label={t('results:raw')} value={String(Math.round(result.rawWpm))} muted={failed} />
        <Stat label={t('results:consistency')} value={`${Math.round(result.consistency)}%`} muted={failed} />
        <Stat
          label={t('results:characters')}
          value={`${correct}/${incorrect}/${extra}/${missed}`}
          title={t('results:charactersTitle')}
          muted={failed}
        />
        <Stat label={t('results:time')} value={t('results:seconds', { value: seconds })} muted={failed} />
        <Stat label={t('results:test')} value={testLabel(config, t)} muted={failed} />
      </dl>

      {hasKeys && <KeyHeatmap stats={missedKeys} language={config.language} />}

      {slowest.length > 0 && <SlowestWords words={slowest} onPractice={practice} />}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onNext}
          title={t('results:nextTitle')}
          aria-label={t('results:next')}
          className={ACTION_BUTTON}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRepeat}
          title={t('results:repeatTitle')}
          aria-label={t('results:repeat')}
          className={ACTION_BUTTON}
        >
          <RotateCcw size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => void onCopy()}
          title={t('results:copyTitle')}
          aria-label={t('results:copy')}
          className={ACTION_BUTTON}
        >
          <Copy size={18} aria-hidden="true" />
        </button>
        {hasEvents && (
          <button
            type="button"
            onClick={() => setReplayOpen((open) => !open)}
            aria-expanded={replayOpen}
            aria-controls="replay-panel"
            title={t('results:replayTitle')}
            aria-label={t('results:replay')}
            className={ACTION_BUTTON}
          >
            <PlayCircle size={18} aria-hidden="true" />
          </button>
        )}
        <span role="status" aria-live="polite" className="text-[0.9rem] text-main">
          {copied ? t('results:copied') : ''}
        </span>
        <SaveStatus saveState={saveState} />
      </div>
    </section>
  );
}

function SaveStatus({ saveState }: { saveState: SaveState }) {
  const { t } = useTranslation();
  switch (saveState.status) {
    case 'idle':
      return null;
    case 'saving':
      return <span className="text-[0.9rem] text-sub">{t('results:saving')}</span>;
    case 'saved':
      return <span className="text-[0.9rem] text-main">{t('results:saved')}</span>;
    case 'anonymous':
      return (
        <Link to="/login" className="text-[0.9rem] text-sub underline underline-offset-4 hover:text-text">
          {t('results:loginToSave')}
        </Link>
      );
    case 'error':
      return (
        <span className="text-[0.9rem] text-error">{t('results:saveError', { message: saveState.message })}</span>
      );
    case 'skipped': {
      const key =
        saveState.reason === 'short'
          ? 'results:skippedShort'
          : saveState.reason === 'failed'
            ? 'results:skippedFailed'
            : 'results:skippedAccuracy';
      return <span className="text-[0.9rem] text-sub">{t(key)}</span>;
    }
  }
}
