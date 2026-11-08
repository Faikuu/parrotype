import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/components/cn';
import type { CharState, EngineState } from '@/lib/engine/types';
import { useSettings } from '@/store/settings';
import { Caret } from './Caret';

interface LetterState {
  char: string;
  state: CharState;
}

/** Per-letter states for one word: target letters, then extra typed letters. Mirrors engine getCharStates. */
function lettersOf(target: string, typed: string, left: boolean): LetterState[] {
  const out: LetterState[] = [];
  for (let k = 0; k < target.length; k++) {
    const char = target.charAt(k);
    if (k < typed.length) {
      out.push({ char, state: typed.charAt(k) === char ? 'correct' : 'incorrect' });
    } else {
      out.push({ char, state: left ? 'missed' : 'pending' });
    }
  }
  for (let k = target.length; k < typed.length; k++) {
    out.push({ char: typed.charAt(k), state: 'extra' });
  }
  return out;
}

const LETTER_CLASS: Record<CharState, string> = {
  correct: 'text-text',
  incorrect: 'text-error',
  extra: 'text-error-extra',
  missed: 'text-sub',
  pending: 'text-sub',
};

interface WordProps {
  index: number;
  target: string;
  typed: string;
  left: boolean;
  blind: boolean;
}

// Memoised: only the previous and current word change on a keystroke, so the rest skip re-rendering.
const Word = memo(function Word({ index, target, typed, left, blind }: WordProps) {
  const letters = lettersOf(target, typed, left);
  const wrong = left && typed !== target;
  return (
    <span className={cn('word', wrong && !blind && 'word-error')} data-word={index}>
      {letters.map((l, k) => {
        let cls = LETTER_CLASS[l.state];
        if (blind) cls = l.state === 'missed' || l.state === 'pending' ? 'text-sub' : 'text-text';
        return (
          <span key={k} data-w={index} data-c={k} className={cls}>
            {l.char}
          </span>
        );
      })}
    </span>
  );
});

export interface WordsProps {
  state: EngineState;
  onActivate: () => void;
}

/** Three visible lines of words. Scrolls by whole lines so the active line stays on the middle line. */
export function Words({ state, onActivate }: WordsProps) {
  const { t } = useTranslation();
  const blind = useSettings((s) => s.blindMode);
  const font = useSettings((s) => s.font);
  const fontSize = useSettings((s) => s.fontSize);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const [version, setVersion] = useState(0);
  const current = state.current;

  // Re-measure on resize and when the font loads, so line wrapping is up to date.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const bump = () => setVersion((v) => v + 1);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(bump);
    ro?.observe(vp);
    document.fonts?.addEventListener('loadingdone', bump);
    return () => {
      ro?.disconnect();
      document.fonts?.removeEventListener('loadingdone', bump);
    };
  }, []);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const el = vp.querySelector<HTMLElement>(`[data-word="${current}"]`);
    if (!el) {
      if (shift !== 0) setShift(0);
      return;
    }
    const pitch = el.offsetHeight || 1;
    const line = Math.round(el.offsetTop / pitch);
    let next = shift;
    if (line - shift >= 2) next = line - 1;
    else if (line - shift < 1) next = Math.max(0, line - 1);
    if (next !== shift) setShift(next);
  }, [current, state.words.length, shift, version, font, fontSize, blind]);

  return (
    <div ref={viewportRef} className="test-viewport" onClick={onActivate} aria-label={t('test:inputLabel')}>
      <div className="test-lines" style={{ transform: `translateY(${-shift * 1.6}em)` }}>
        {state.words.map((target, i) => (
          <Word
            key={i}
            index={i}
            target={target}
            typed={state.typed[i] ?? ''}
            left={i < current}
            blind={blind}
          />
        ))}
      </div>
      <Caret viewportRef={viewportRef} state={state} shift={shift} />
    </div>
  );
}
