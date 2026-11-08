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
import { ApiError, quotesApi, resultsApi } from '@/lib/api';
import type { ResultInput } from '@/lib/api/types';
import { createInitialState, engineReducer, needsMoreWords } from '@/lib/engine/engine';
import { computeResult } from '@/lib/engine/stats';
import type { Quote } from '@/lib/api/types';
import type { QuoteLength, TestConfig, TestResult } from '@/lib/engine/types';
import { generateWords, quoteToWords, wordsForConfig } from '@/lib/text/generator';
import { selectTestConfig, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { pickBuiltinQuote } from './builtinQuotes';

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

export interface TypingTest {
  state: ReturnType<typeof createInitialState>;
  result: TestResult | null;
  saveState: SaveState;
  quote: QuoteInfo;
  inputRef: RefObject<HTMLInputElement | null>;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  typeText: (text: string) => void;
  restart: () => void;
  repeat: () => void;
  focusInput: () => void;
}

/** mode2 for the saved result: time seconds, word count, quote length, pangram count, or the mode name. */
export function mode2Of(cfg: TestConfig): string {
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
  }
}

function skipReason(r: TestResult): SkipReason | null {
  if (r.durationMs < MIN_SAVE_MS) return 'short';
  if (r.accuracy < MIN_SAVE_ACCURACY) return 'accuracy';
  return null;
}

function toInput(cfg: TestConfig, r: TestResult): ResultInput {
  return {
    mode: cfg.mode,
    mode2: mode2Of(cfg),
    language: cfg.language,
    wpm: r.wpm,
    rawWpm: r.rawWpm,
    accuracy: r.accuracy,
    consistency: r.consistency,
    durationMs: Math.round(r.durationMs),
    charStats: r.charStats,
    punctuation: cfg.punctuation,
    numbers: cfg.numbers,
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
      const words = wordsForConfig(cfg);
      initialWordsRef.current = words;
      dispatch({ type: 'reset', words, config: cfg });
      setQuote({ loading: false, source: null, fallback: false });
      return;
    }

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

  const result = useMemo(() => (status === 'finished' ? computeResult(state) : null), [status, state]);

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
    resultsApi.submit(toInput(cfg, result)).then(
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
  }, [status, result, state.config, user, authLoading, qc]);

  const canType = useCallback((): boolean => {
    const ui = useUi.getState();
    if (ui.commandLineOpen || ui.customTextOpen) return false;
    return !document.querySelector('[aria-modal="true"]');
  }, []);

  const playable = useCallback((): boolean => {
    const s = stateRef.current;
    return s.status !== 'finished' && (s.words.length > 0 || s.config.mode === 'zen');
  }, []);

  const typeText = useCallback(
    (text: string) => {
      if (!canType() || !playable()) return;
      for (const ch of text) {
        const at = Date.now();
        if (ch === ' ') dispatch({ type: 'space', at });
        else if (ch === '\n' || ch === '\r') dispatch({ type: 'newline', at });
        else if (ch.charCodeAt(0) < 32) continue;
        else dispatch({ type: 'char', char: ch, at });
      }
    },
    [canType, playable],
  );

  const backspace = useCallback(
    (word: boolean) => {
      if (!canType()) return;
      dispatch({ type: 'backspace', at: Date.now(), word });
    },
    [canType],
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

  return { state, result, saveState, quote, inputRef, onKeyDown, typeText, restart, repeat, focusInput };
}
