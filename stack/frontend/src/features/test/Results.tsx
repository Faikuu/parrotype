import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CategoryScale, Chart as ChartJS, LineController, LineElement, LinearScale, PointElement, ScatterController, Tooltip, type ChartData, type ChartOptions } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { ChevronRight, Copy, Ghost, PlayCircle, RotateCcw, Share2 } from 'lucide-react';
import { bigramWords, slowestBigrams } from '@/lib/engine/bigrams';
import { slowestWords } from '@/lib/engine/timings';
import type { EngineState, TestConfig } from '@/lib/engine/types';
import { useBigramStats } from '@/store/bigramStats';
import { foldKeyStats } from '@/store/keyStats';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { KeyHeatmap } from './KeyHeatmap';
import { ReplayPlayer } from './ReplayPlayer';
import { SlowestPairs } from './SlowestPairs';
import { SlowestWords } from './SlowestWords';
import { copyText, summaryText } from './copySummary';
import { practiceText } from './practice';
import { shareResultCard } from './shareCard';
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

/** Snippet language names, as they are written (not translated). */
const CODE_NAMES: Record<TestConfig['codeLanguage'], string> = { js: 'JavaScript', py: 'Python', rs: 'Rust', go: 'Go' };

function testLabel(cfg: TestConfig, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const mode = t(`settings:modes.${cfg.mode}`).toLowerCase();
  let value = '';
  switch (cfg.mode) {
    case 'code':
      value = CODE_NAMES[cfg.codeLanguage];
      break;
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
  // Code snippets are not in a spoken language, so the language is left out of their label.
  const code = cfg.mode === 'code';
  return [
    mode,
    value,
    code ? '' : cfg.language,
    !code && cfg.punctuation ? t('results:punctuationOn') : '',
    !code && cfg.numbers ? t('results:numbersOn') : '',
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
  /** Restart with the same words, racing this run as a ghost. */
  onRaceGhost?: () => void;
  /** The signed-in user's name, drawn on the share card. */
  username?: string | null;
}

/** How long "Copied" stays after a copy. */
const COPIED_MS = 2000;

export function Results({ config, result, state, date, saveState, onNext, onRepeat, onRaceGhost, username = null }: ResultsProps) {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const samples = result.samples;
  const { correct, incorrect, extra, missed } = result.charStats;
  const [copied, setCopied] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const ghostOn = useSettings((s) => s.ghost);
  const layout = useSettings((s) => s.layout);
  const missedKeys = useMemo(() => foldKeyStats(result.keyStats, config.language), [result.keyStats, config.language]);
  const hasKeys = Object.keys(missedKeys).length > 0;
  const slowest = useMemo(() => slowestWords(state, 5), [state]);
  const bigramTotals = useBigramStats((s) => s.byLanguage[config.language]);
  const pairs = useMemo(() => slowestBigrams(bigramTotals ?? {}, 5, 3), [bigramTotals]);
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

  // Custom text of words that contain the slow letter pairs, then a restart in custom mode.
  function practicePairs() {
    const words = bigramWords(pairs.map((p) => p.pair), config.language, 40);
    useSettings.getState().setMany({ customText: words.join(' '), mode: 'custom' });
    useUi.getState().restart();
  }

  async function onShare() {
    setSharing(true);
    setShareFailed(false);
    try {
      const shownDate = new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${date}T00:00:00Z`),
      );
      await shareResultCard({
        wpm: result.wpm,
        accuracy: result.accuracy,
        testLabel: testLabel(config, t),
        date: shownDate,
        username,
        samples,
        labels: { brand: 'parrotype', wpm: t('results:wpm'), acc: t('results:acc') },
      });
    } catch {
      setShareFailed(true);
    } finally {
      setSharing(false);
    }
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
          <ReplayPlayer config={state.config} words={state.words} events={state.events} final={state} code={state.code} />
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

      {hasKeys && <KeyHeatmap stats={missedKeys} language={config.language} layout={layout} />}

      {slowest.length > 0 && <SlowestWords words={slowest} onPractice={practice} />}

      {pairs.length > 0 && <SlowestPairs pairs={pairs} onPractice={practicePairs} />}

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
        {ghostOn && hasEvents && onRaceGhost && (
          <button
            type="button"
            onClick={onRaceGhost}
            title={t('results:raceGhostTitle')}
            aria-label={t('results:raceGhost')}
            className={ACTION_BUTTON}
          >
            <Ghost size={18} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => void onShare()}
          disabled={sharing}
          title={t('results:shareTitle')}
          aria-label={t('results:share')}
          className={ACTION_BUTTON}
        >
          <Share2 size={18} aria-hidden="true" />
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
          {shareFailed ? <span className="text-error">{t('results:shareError')}</span> : null}
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
