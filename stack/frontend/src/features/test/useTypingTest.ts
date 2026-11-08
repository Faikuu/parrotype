import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useAuth } from '@/features/auth/useAuth';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError, quotesApi, resultsApi } from '@/lib/api';
import type { Quote, ResultInput, Summary } from '@/lib/api/types';
import { createInitialState, engineReducer, needsMoreWords } from '@/lib/engine/engine';
import { computeResult } from '@/lib/engine/stats';
import type { EngineAction, EngineState, Mode, QuoteLength, TestConfig, TestResult } from '@/lib/engine/types';
import { utcDateString } from '@/lib/text/daily';
import { generateWords, quoteToWords, wordsForConfig } from '@/lib/text/generator';
import { useKeyStats, weakLetters } from '@/store/keyStats';
import {
  bestKey,
  averageOf,
  isPersonalBest as beatsBest,
  serverBestComparable,
  useLocalBests,
} from '@/store/localBests';
import { selectTestConfig, useSettings, type PaceCaret } from '@/store/settings';
import { useUi } from '@/store/ui';
import { pickBuiltinQuote } from './builtinQuotes';
import { playKeySound } from './sound';

/** Tab then Enter within this window restarts the test. */
const TAB_WINDOW_MS = 1000;
const TICK_MS = 100;
/** Extra words generated when a time test runs low on text. */
const APPEND_CHUNK = 50;
/** Tests shorter than this are not saved. */
const MIN_SAVE_MS = 2000;
/** Tests below this accuracy are not saved. */
const MIN_SAVE_ACCURACY = 50;

export type SkipReason = 'short' | 'accuracy';

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string }
  | { status: 'anonymous' }
  | { status: 'skipped'; reason: SkipReason };

export interface QuoteInfo {
  loading: boolean;
  source: string | null;
  /** True when the built-in sentence is used instead of an API quote. */
  fallback: boolean;
}

/** A finished test. `isPersonalBest` is false for tests that are too short or inaccurate to count. */
export type FinishedResult = TestResult & { isPersonalBest: boolean };

export interface TypingTest {
  state: ReturnType<typeof createInitialState>;
  result: FinishedResult | null;
  /** Target wpm for the pace caret, or null when there is no pace caret. */
  pace: number | null;
  /** UTC date the current words were generated for. */
  runDate: string;
  saveState: SaveState;
  quote: QuoteInfo;
  inputRef: RefObject<HTMLInputElement | null>;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  typeText: (text: string) => void;
  restart: () => void;
  repeat: () => void;
  focusInput: () => void;
}

/**
 * mode2 for the saved result: time seconds, word count, quote length, pangram count, the date for
 * daily, or the mode name. `date` is the UTC date the test's words were generated for, stored with the
 * words, so a test that runs past midnight keeps its own day.
 */
export function mode2Of(cfg: TestConfig, date: string): string {
  switch (cfg.mode) {
    case 'time':
      return String(cfg.time);
    case 'words':
      return String(cfg.words);
    case 'quote':
      return cfg.quoteLength;
    case 'pangram':
      return String(cfg.pangramCount);
    case 'custom':
      return 'custom';
    case 'zen':
      return 'zen';
    case 'daily':
      return date;
    case 'weak':
      return 'weak';
  }
}

export interface PaceInput {
  caret: PaceCaret;
  customWpm: number;
  mode: Mode;
  localBest?: number;
  serverBest?: number;
  average: number | null;
}

/**
 * The pace caret's speed. Your best (the higher of the local and account best for this config), your
 * average, or a set speed. Null when there is nothing to pace against, or in zen and custom modes.
 */
export function paceTarget(p: PaceInput): number | null {
  if (p.caret === 'off' || p.mode === 'zen' || p.mode === 'custom') return null;
  switch (p.caret) {
    case 'custom':
      return p.customWpm;
    case 'pb': {
      const best = Math.max(p.localBest ?? -Infinity, p.serverBest ?? -Infinity);
      return Number.isFinite(best) ? best : null;
    }
    case 'average':
      return p.average;
    default:
      return null;
  }
}

/**
 * The account's best wpm for the same mode, mode2 and language, from the summary in the query cache.
 * Only returned when the server's best means the same test (see serverBestComparable).
 */
function serverBestWpm(qc: QueryClient, cfg: TestConfig, date: string): number | undefined {
  if (!serverBestComparable(cfg)) return undefined;
  const mode2 = mode2Of(cfg, date);
  const summary = qc.getQueryData<Summary>(['summary']);
  return summary?.bests.find((b) => b.mode === cfg.mode && b.mode2 === mode2 && b.language === cfg.language)?.wpm;
}

function skipReason(r: TestResult): SkipReason | null {
  if (r.durationMs < MIN_SAVE_MS) return 'short';
  if (r.accuracy < MIN_SAVE_ACCURACY) return 'accuracy';
  return null;
}

function toInput(cfg: TestConfig, r: TestResult, date: string): ResultInput {
  // Daily text is always punctuated and has no numbers, whatever the user's flags say.
  const daily = cfg.mode === 'daily';
  return {
    mode: cfg.mode,
    mode2: mode2Of(cfg, date),
    language: cfg.language,
    wpm: r.wpm,
    rawWpm: r.rawWpm,
    accuracy: r.accuracy,
    consistency: r.consistency,
    durationMs: Math.round(r.durationMs),
    charStats: r.charStats,
    punctuation: daily ? true : cfg.punctuation,
    numbers: daily ? false : cfg.numbers,
  };
}

/**
 * Fetches a quote. A 404 for a specific length is retried once with length 'any'
 * (the backend has no quotes for that length in some languages). Other failures throw.
 */
async function fetchQuote(
  language: TestConfig['language'],
  length: QuoteLength,
  signal: AbortSignal,
): Promise<Quote> {
  try {
    return await quotesApi.random({ language, length }, signal);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404 && length !== 'any') {
      return quotesApi.random({ language, length: 'any' }, signal);
    }
    throw err;
  }
}

function quickRestartPending(tabAt: number): boolean {
  return tabAt > 0 && Date.now() - tabAt < TAB_WINDOW_MS;
}

function isEditableOther(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

export function useTypingTest(): TypingTest {
  const config = useSettings(useShallow(selectTestConfig));
  const configKey = JSON.stringify(config);
  const restartToken = useUi((s) => s.restartToken);
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();

  const [state, dispatch] = useReducer(engineReducer, undefined, () =>
    createInitialState(selectTestConfig(useSettings.getState()), []),
  );
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  // UTC date the current test's words were generated for (daily mode saves under it).
  const [runDate, setRunDate] = useState(() => utcDateString());
  const paceCaret = useSettings((s) => s.paceCaret);
  const paceWpm = useSettings((s) => s.paceWpm);
  const localBestMap = useLocalBests((s) => s.bests);
  const recentWpm = useLocalBests((s) => s.recentWpm);

  const inputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const initialWordsRef = useRef<string[]>([]);
  const tabAtRef = useRef(0);
  const composingRef = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [quote, setQuote] = useState<QuoteInfo>({ loading: false, source: null, fallback: false });

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Regenerate the test whenever the config or the restart token changes.
  useLayoutEffect(() => {
    const cfg = selectTestConfig(useSettings.getState());
    runRef.current += 1;
    setSaveState({ status: 'idle' });

    if (cfg.mode !== 'quote') {
      const now = Date.now();
      const weakKeys = cfg.mode === 'weak' ? weakLetters(useKeyStats.getState().byLanguage[cfg.language], cfg.language) : [];
      const words = wordsForConfig(cfg, Math.random, { weakKeys, now });
      initialWordsRef.current = words;
      setRunDate(utcDateString(now));
      dispatch({ type: 'reset', words, config: cfg });
      setQuote({ loading: false, source: null, fallback: false });
      return;
    }
    setRunDate(utcDateString());

    const ctrl = new AbortController();
    initialWordsRef.current = [];
    dispatch({ type: 'reset', words: [], config: cfg });
    setQuote({ loading: true, source: null, fallback: false });

    const apply = (words: string[], info: QuoteInfo) => {
      initialWordsRef.current = words;
      dispatch({ type: 'reset', words, config: cfg });
      setQuote(info);
    };

    fetchQuote(cfg.language, cfg.quoteLength, ctrl.signal)
      .then((q) => {
        if (ctrl.signal.aborted) return;
        apply(quoteToWords(q.text), { loading: false, source: q.source, fallback: false });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        const b = pickBuiltinQuote(cfg.language);
        apply(quoteToWords(b.text), { loading: false, source: b.source, fallback: true });
      });

    return () => ctrl.abort();
  }, [configKey, restartToken]);

  const status = state.status;

  // Clock: ticks every 100ms while running. Equal states bail out, so this only re-renders when samples change.
  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => dispatch({ type: 'tick', at: Date.now() }), TICK_MS);
    return () => clearInterval(id);
  }, [status]);

  // Time mode: keep enough words ahead of the caret.
  useEffect(() => {
    if (status === 'running' && needsMoreWords(state)) {
      dispatch({ type: 'append', words: generateWords(selectTestConfig(useSettings.getState()), APPEND_CHUNK) });
    }
  }, [status, state]);

  useEffect(() => {
    useUi.getState().setTyping(status === 'running');
  }, [status]);

  useEffect(() => () => useUi.getState().setTyping(false), []);

  // The personal best is decided once per finished run, against the bests as they were before this run is
  // written to them (the effect below does that). It is kept with the state it was decided for, so later
  // changes (the signed-in user, the cached summary, the local best just written) cannot flip it.
  const [pbSnapshot, setPbSnapshot] = useState<{ state: EngineState; isPersonalBest: boolean } | null>(null);
  useLayoutEffect(() => {
    if (status !== 'finished' || pbSnapshot?.state === state) return;
    const r = computeResult(state);
    let isPb = false;
    if (!skipReason(r)) {
      const key = bestKey(state.config, mode2Of(state.config, runDate));
      const local = useLocalBests.getState().bests[key]?.wpm;
      const server = user ? serverBestWpm(qc, state.config, runDate) : undefined;
      isPb = beatsBest(r.wpm, local, server);
    }
    setPbSnapshot({ state, isPersonalBest: isPb });
  }, [status, state, runDate, qc, user, pbSnapshot]);

  const result = useMemo<FinishedResult | null>(() => {
    if (status !== 'finished') return null;
    const r = computeResult(state);
    return { ...r, isPersonalBest: pbSnapshot?.state === state && pbSnapshot.isPersonalBest };
  }, [status, state, pbSnapshot]);

  // Once per finished run: fold its key stats into the local totals, and its wpm into the local bests.
  const recordedRun = useRef(-1);
  useEffect(() => {
    if (status !== 'finished' || !result) return;
    const run = runRef.current;
    if (recordedRun.current === run) return;
    recordedRun.current = run;
    useKeyStats.getState().record(result.keyStats, state.config.language);
    if (!skipReason(result)) {
      useLocalBests.getState().record(bestKey(state.config, mode2Of(state.config, runDate)), result);
    }
  }, [status, result, state.config, runDate]);

  // Save a finished test once auth has settled. Each run is submitted at most once.
  const submittedRun = useRef(-1);
  useEffect(() => {
    if (status !== 'finished' || !result) return;
    const run = runRef.current;
    if (submittedRun.current === run) return;
    if (authLoading) return;
    submittedRun.current = run;

    const cfg = state.config;
    const reason = skipReason(result);
    if (reason) {
      setSaveState({ status: 'skipped', reason });
      return;
    }
    if (!user) {
      setSaveState({ status: 'anonymous' });
      return;
    }
    setSaveState({ status: 'saving' });
    resultsApi.submit(toInput(cfg, result, runDate)).then(
      () => {
        if (runRef.current !== run) return;
        setSaveState({ status: 'saved' });
        void qc.invalidateQueries({ queryKey: ['results'] });
        void qc.invalidateQueries({ queryKey: ['summary'] });
      },
      (err: unknown) => {
        if (runRef.current !== run) return;
        const message = err instanceof Error ? err.message : 'unknown error';
        setSaveState({ status: 'error', message });
      },
    );
  }, [status, result, state.config, runDate, user, authLoading, qc]);

  const pace = paceTarget({
    caret: paceCaret,
    customWpm: paceWpm,
    mode: state.config.mode,
    localBest: localBestMap[bestKey(state.config, mode2Of(state.config, runDate))]?.wpm,
    serverBest: user ? serverBestWpm(qc, state.config, runDate) : undefined,
    average: averageOf(recentWpm),
  });

  const canType = useCallback((): boolean => {
    const ui = useUi.getState();
    if (ui.commandLineOpen || ui.customTextOpen) return false;
    return !document.querySelector('[aria-modal="true"]');
  }, []);

  const playable = useCallback((): boolean => {
    const s = stateRef.current;
    return s.status !== 'finished' && (s.words.length > 0 || s.config.mode === 'zen');
  }, []);

  /**
   * Sends one action to the engine and plays its sound. The reducer runs here as well, from the last
   * committed state, so each key's sound knows whether it was right (React applies the same actions).
   */
  const apply = useCallback((base: ReturnType<typeof createInitialState>, action: EngineAction) => {
    const next = engineReducer(base, action);
    if (next !== base) {
      const { sound, soundVolume } = useSettings.getState();
      if (action.type === 'char' || action.type === 'space') {
        const added = next.keystrokes[next.keystrokes.length - 1];
        const error = action.type === 'char' && added !== undefined && !added.correct;
        playKeySound({ profile: sound, volume: soundVolume, kind: action.type === 'space' ? 'space' : 'key', error });
      } else if (action.type === 'backspace') {
        playKeySound({ profile: sound, volume: soundVolume, kind: 'backspace' });
      }
    }
    return next;
  }, []);

  const typeText = useCallback(
    (text: string) => {
      if (!canType() || !playable()) return;
      let base = stateRef.current;
      for (const ch of text) {
        const at = Date.now();
        let action: EngineAction;
        if (ch === ' ') action = { type: 'space', at };
        else if (ch === '\n' || ch === '\r') action = { type: 'newline', at };
        else if (ch.charCodeAt(0) < 32) continue;
        else action = { type: 'char', char: ch, at };
        base = apply(base, action);
        dispatch(action);
      }
    },
    [canType, playable, apply],
  );

  const backspace = useCallback(
    (word: boolean) => {
      if (!canType()) return;
      const action: EngineAction = { type: 'backspace', at: Date.now(), word };
      apply(stateRef.current, action);
      dispatch(action);
    },
    [canType, apply],
  );

  const newline = useCallback(() => {
    if (!canType()) return;
    dispatch({ type: 'newline', at: Date.now() });
  }, [canType]);

  const restart = useCallback(() => {
    useUi.getState().restart();
    focusInput();
  }, [focusInput]);

  const repeat = useCallback(() => {
    const cfg = selectTestConfig(useSettings.getState());
    runRef.current += 1;
    setSaveState({ status: 'idle' });
    dispatch({ type: 'reset', words: initialWordsRef.current, config: cfg });
    focusInput();
  }, [focusInput]);

  // Native input listeners: beforeinput (desktop + most mobile), composition, and an input fallback.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const onBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (ie.isComposing || composingRef.current) return;
      if (ie.inputType === 'insertCompositionText') return;
      const type = ie.inputType;
      if (type === 'insertText' || (!type && ie.data)) {
        ie.preventDefault();
        if (ie.data) typeText(ie.data);
        return;
      }
      ie.preventDefault();
      if (type === 'deleteContentBackward') backspace(false);
      else if (type === 'deleteWordBackward') backspace(true);
      else if (type === 'insertLineBreak' || type === 'insertParagraph') newline();
      // Paste, drop and everything else is ignored.
    };
    const onCompositionStart = () => {
      composingRef.current = true;
    };
    const onCompositionEnd = (e: Event) => {
      composingRef.current = false;
      const data = (e as CompositionEvent).data;
      el.value = '';
      if (data) typeText(data);
    };
    const onInput = (e: Event) => {
      if ((e as InputEvent).isComposing || composingRef.current) return;
      const v = el.value;
      if (!v) return;
      el.value = '';
      typeText(v);
    };

    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('input', onInput);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('input', onInput);
    };
  }, [typeText, backspace, newline]);

  // Keys that need the input focused: Backspace, Space, Enter.
  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      const mod = e.ctrlKey || e.altKey || e.metaKey;
      switch (e.key) {
        case 'Backspace':
          e.preventDefault();
          backspace(mod);
          return;
        case ' ':
          e.preventDefault();
          if (!mod) typeText(' ');
          return;
        case 'Enter':
          // Quick restart (tab + enter) is handled on window.
          if (quickRestartPending(tabAtRef.current)) return;
          e.preventDefault();
          if (e.shiftKey) newline();
          return;
        default:
          return;
      }
    },
    [backspace, typeText, newline],
  );

  // Window keys: quick restart, and redirecting typing to the input when nothing is focused.
  useEffect(() => {
    const onWindowKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !canType()) return;
      const { quickRestart } = useSettings.getState();

      if (e.key === 'Tab') {
        if (quickRestart === 'tab' && !e.shiftKey) tabAtRef.current = Date.now();
        return;
      }
      if (e.key === 'Enter' && quickRestart === 'tab' && !e.shiftKey && quickRestartPending(tabAtRef.current)) {
        tabAtRef.current = 0;
        e.preventDefault();
        restart();
        return;
      }
      if (e.key === 'Escape' && quickRestart === 'esc' && !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) {
        e.preventDefault();
        restart();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableOther(e.target)) return;

      const target = e.target;
      const onBody =
        target === null ||
        target === document.body ||
        target === document.documentElement ||
        (target instanceof HTMLElement && target.dataset.typingRedirect !== undefined);
      if (!onBody) return;

      if (e.key === ' ') {
        e.preventDefault();
        focusInput();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        focusInput();
      } else if (e.key.length === 1) {
        // Focus during keydown so the character lands in the input.
        focusInput();
      }
    };
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  }, [canType, focusInput, restart]);

  return {
    state,
    result,
    pace,
    runDate,
    saveState,
    quote,
    inputRef,
    onKeyDown,
    typeText,
    restart,
    repeat,
    focusInput,
  };
}
