import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Words } from '@/features/test/Words';
import { useLayoutKeydown } from '@/features/test/useLayoutInput';
import { createInitialState, engineReducer } from '@/lib/engine/engine';
import type { EngineAction, EngineState, TestConfig } from '@/lib/engine/types';
import type { Language } from '@/lib/api/types';
import { quoteToWords } from '@/lib/text/generator';
import { selectTestConfig, useSettings } from '@/store/settings';
import { allWordsCorrect, eventConfig } from './submission';

/** The engine samples once a second; the frontend ticks about every 100 ms, as in the main test. */
const TICK_MS = 100;

export interface EventTypingAreaProps {
  text: string;
  language: Language;
  /** Called once with the finished engine state (its events are the replay). */
  onFinish: (state: EngineState) => void;
}

/**
 * The typing view of an event run. It uses the main test's engine and keyboard handling, with the event text as a
 * custom text. A finish is only passed on when every word is right, because the server needs every character.
 */
export function EventTypingArea({ text, language, onFinish }: EventTypingAreaProps) {
  const { t } = useTranslation();
  const words = useMemo(() => quoteToWords(text), [text]);
  const config = useMemo<TestConfig>(() => {
    const settings = selectTestConfig(useSettings.getState());
    // Stop on a wrong word unless the player chose stop-on-letter: a wrong word then has to be fixed before the space.
    return eventConfig({ ...settings, stopOnError: settings.stopOnError === 'letter' ? 'letter' : 'word' }, text, language);
  }, [text, language]);

  const [state, setState] = useState<EngineState>(() => createInitialState(config, words));
  const stateRef = useRef(state);
  const onFinishRef = useRef(onFinish);
  const reportedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const apply = useCallback((action: EngineAction) => {
    const base = stateRef.current;
    if (base.status === 'finished') return;
    const next = engineReducer(base, action);
    if (next === base) return;
    // The engine can finish on the last word with an earlier word still wrong. Such a finish is dropped.
    if (next.status === 'finished' && !allWordsCorrect(next)) return;
    stateRef.current = next;
    setState(next);
  }, []);

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

  const backspace = useCallback((word: boolean) => apply({ type: 'backspace', at: Date.now(), word }), [apply]);

  const handleLayoutKey = useLayoutKeydown((ch) => typeText(ch));

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
    if (handleLayoutKey(e.nativeEvent)) return;
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

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Samples for the consistency figure, once the run has started.
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = window.setInterval(() => {
      const prev = stateRef.current;
      if (prev.status !== 'running') return;
      const next = engineReducer(prev, { type: 'tick', at: Date.now() });
      if (next !== prev) {
        stateRef.current = next;
        setState(next);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.status]);

  // Finish once. The parent takes the state and saves it.
  useEffect(() => {
    if (state.status !== 'finished' || reportedRef.current) return;
    reportedRef.current = true;
    onFinishRef.current(state);
  }, [state]);

  const onActivate = () => inputRef.current?.focus({ preventScroll: true });

  return (
    <div className="relative flex flex-col gap-3">
      <input
        ref={inputRef}
        data-typing-input
        type="text"
        className="sr-only"
        aria-label={t('events:typing.inputLabel')}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <Words state={state} onActivate={onActivate} pace={null} />
      {!focused && (
        <button type="button" onClick={onActivate} className="self-center text-[0.9rem] text-sub hover:text-text">
          {t('events:typing.focusHint')}
        </button>
      )}
    </div>
  );
}
