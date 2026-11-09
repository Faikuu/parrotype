import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Words } from '@/features/test/Words';
import { createInitialState, engineReducer } from '@/lib/engine/engine';
import { computeResult } from '@/lib/engine/stats';
import type { EngineAction, EngineState, TestConfig } from '@/lib/engine/types';
import { quoteToWords } from '@/lib/text/generator';
import { selectTestConfig, useSettings } from '@/store/settings';
import { allWordsCorrect, correctCharsOf } from './raceProgress';
import type { FinishPayload } from './raceClient';

export interface TypingAreaProps {
  /** The room's quote, exactly as the server counts it. */
  text: string;
  /** Typing is accepted only while this is true (racing, or the countdown has ended). */
  open: boolean;
  /** Every change: correct chars typed so far and the live wpm. */
  onChange: (chars: number, wpm: number) => void;
  /** Called once when the local run completes (every word typed correctly). */
  onFinish: (result: FinishPayload) => void;
}

const TICK_MS = 250;

/**
 * The racer's own typing area: the quote in the engine's quote mode, a hidden focused input, and
 * the same keyboard rules as the main test. Mount it with a key per race so each race starts fresh.
 */
export function TypingArea({ text, open, onChange, onFinish }: TypingAreaProps) {
  const { t } = useTranslation();
  const words = useMemo(() => quoteToWords(text), [text]);
  const config = useMemo<TestConfig>(
    () => ({ ...selectTestConfig(useSettings.getState()), mode: 'quote', noBackspace: false, suddenDeath: false }),
    [],
  );

  const [state, setState] = useState<EngineState>(() => createInitialState(config, words));
  const stateRef = useRef(state);
  const openRef = useRef(open);
  const onChangeRef = useRef(onChange);
  const onFinishRef = useRef(onFinish);
  const reportedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    openRef.current = open;
    onChangeRef.current = onChange;
    onFinishRef.current = onFinish;
  }, [open, onChange, onFinish]);

  /**
   * Applies one action. The engine can finish a quote with an earlier word still wrong (it only
   * checks the last word), but the server needs every char, so such a finish is dropped and the
   * racer fixes the word first.
   */
  const apply = useCallback(
    (action: EngineAction) => {
      const base = stateRef.current;
      if (!openRef.current || base.status === 'finished') return;
      const next = engineReducer(base, action);
      if (next === base) return;
      if (next.status === 'finished' && !allWordsCorrect(next)) return;
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  const typeText = useCallback(
    (value: string) => {
      for (const ch of value) {
        const at = Date.now();
        if (ch === ' ') apply({ type: 'space', at });
        else if (ch.charCodeAt(0) < 32) continue;
        else apply({ type: 'char', char: ch, at });
      }
    },
    [apply],
  );

  const backspace = useCallback(
    (word: boolean) => apply({ type: 'backspace', at: Date.now(), word }),
    [apply],
  );

  // Native input events: beforeinput for desktop and most mobile keyboards, composition, and an input fallback.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    let composing = false;

    const onBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (ie.isComposing || composing) return;
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
      // Paste, drop, line breaks and everything else is ignored.
    };
    const onCompositionStart = () => {
      composing = true;
    };
    const onCompositionEnd = (e: Event) => {
      composing = false;
      const data = (e as CompositionEvent).data;
      el.value = '';
      if (data) typeText(data);
    };
    const onInput = (e: Event) => {
      if ((e as InputEvent).isComposing || composing) return;
      const value = el.value;
      if (!value) return;
      el.value = '';
      typeText(value);
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
  }, [typeText, backspace]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const mod = e.ctrlKey || e.altKey || e.metaKey;
    if (e.key === 'Backspace') {
      e.preventDefault();
      backspace(mod);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!mod) typeText(' ');
    } else if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  // Focus when typing opens (the countdown has ended).
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Sample the engine every so often so consistency has data.
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(() => {
      const prev = stateRef.current;
      if (prev.status !== 'running') return;
      const next = engineReducer(prev, { type: 'tick', at: Date.now() });
      if (next !== prev) {
        stateRef.current = next;
        setState(next);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [state.status]);

  // Report progress for every state change. The race hook throttles what goes to the server.
  useEffect(() => {
    if (state.status === 'idle') return;
    const chars = correctCharsOf(state);
    const wpm = state.keystrokes.length > 0 ? computeResult(state).wpm : 0;
    onChangeRef.current(chars, wpm);
  }, [state]);

  // Finish once. Declared after the progress report, so the final chars go out before the finish.
  useEffect(() => {
    if (state.status !== 'finished' || reportedRef.current) return;
    reportedRef.current = true;
    const result = computeResult(state);
    onFinishRef.current({
      chars: correctCharsOf(state),
      wpm: result.wpm,
      accuracy: result.accuracy,
      durationMs: result.durationMs,
    });
  }, [state]);

  const onActivate = () => inputRef.current?.focus({ preventScroll: true });

  return (
    <div className="relative flex flex-col gap-3">
      <input
        ref={inputRef}
        data-typing-input
        type="text"
        className="sr-only"
        aria-label={t('test:inputLabel')}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <div className={open ? undefined : 'pointer-events-none opacity-60'}>
        <Words state={state} onActivate={onActivate} pace={null} />
      </div>
      {open && !focused && (
        <button type="button" onClick={onActivate} className="self-center text-[0.9rem] text-sub hover:text-text">
          {t('race:room.focusHint')}
        </button>
      )}
    </div>
  );
}
