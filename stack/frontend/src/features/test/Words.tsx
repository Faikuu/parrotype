import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/components/cn';
import type { CharState, CodeLines, EngineState } from '@/lib/engine/types';
import { useSettings } from '@/store/settings';
import { Caret } from './Caret';
import { GhostCaret, type GhostRun } from './GhostCaret';
import { PaceCaret } from './PaceCaret';
import { layoutX, tapeOffsetFor } from './caretGeometry';

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
  /** Code mode: spaces of indentation before this word (it starts a line). */
  indent: number;
  /** Code mode: this word ends its line, so a faint ↵ follows it. */
  lineEnd: boolean;
}

// Memoised: only the previous and current word change on a keystroke, so the rest skip re-rendering.
const Word = memo(function Word({ index, target, typed, left, blind, indent, lineEnd }: WordProps) {
  const letters = lettersOf(target, typed, left);
  const wrong = left && typed !== target;
  return (
    <span
      className={cn('word', wrong && !blind && 'word-error')}
      data-word={index}
      style={indent > 0 ? { marginInlineStart: `${indent}ch` } : undefined}
    >
      {letters.map((l, k) => {
        let cls = LETTER_CLASS[l.state];
        if (blind) cls = l.state === 'missed' || l.state === 'pending' ? 'text-sub' : 'text-text';
        return (
          <span key={k} data-w={index} data-c={k} className={cls}>
            {l.char}
          </span>
        );
      })}
      {lineEnd && (
        <span aria-hidden="true" className={cn('code-eol', left ? 'text-text' : 'text-sub')}>
          ↵
        </span>
      )}
    </span>
  );
});

export interface WordsProps {
  state: EngineState;
  onActivate: () => void;
  /** Pace caret target in wpm, or null for no pace caret. */
  pace: number | null;
  /** Overrides the smooth caret setting for this view (the replay player). */
  caretSmooth?: boolean;
  /** A previous run to race: its caret is drawn at the position it had at this time. */
  ghost?: GhostRun | null;
}

/**
 * The text. Default: three visible lines that scroll by whole lines so the active line stays on the
 * middle line. Tape mode: one line that slides sideways so the active letter stays about 40% in.
 * Code mode always uses the line view: each line of the snippet breaks after its last word (a zero-height
 * item forces the wrap), and the first word of a line is pushed right by its indentation.
 */
export function Words({ state, onActivate, pace, caretSmooth, ghost }: WordsProps) {
  const { t } = useTranslation();
  const blind = useSettings((s) => s.blindMode);
  const font = useSettings((s) => s.font);
  const fontSize = useSettings((s) => s.fontSize);
  const tapeSetting = useSettings((s) => s.tapeMode);
  const inCode = state.config.mode === 'code';
  const tape = tapeSetting && !inCode;
  const code: CodeLines | undefined = inCode ? state.code : undefined;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const [tapeX, setTapeX] = useState(0);
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
    if (!vp || tape) {
      if (shift !== 0) setShift(0);
      return;
    }
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
  }, [current, state.words.length, shift, version, font, fontSize, blind, tape]);

  // Tape mode: slide the line so the active letter sits at TAPE_ANCHOR of the viewport width.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!tape) {
      if (tapeX !== 0) setTapeX(0);
      return;
    }
    if (!vp) return;
    const target = state.words[current] ?? '';
    const typedLen = state.typed[current]?.length ?? 0;
    const x = layoutX(vp, current, typedLen, target.length);
    if (x === null) return;
    const next = tapeOffsetFor(vp.clientWidth, x);
    if (next !== tapeX) setTapeX(next);
  }, [tape, current, state.typed, state.words, version, font, fontSize, blind, tapeX]);

  // Zen leaves the word under the caret out of `words` until it has text, but the caret needs its element.
  const count = state.config.mode === 'zen' ? Math.max(state.words.length, current + 1) : state.words.length;

  return (
    <div
      ref={viewportRef}
      className="test-viewport"
      data-tape={tape ? '' : undefined}
      onClick={onActivate}
      aria-label={t('test:inputLabel')}
    >
      <div
        className="test-lines"
        data-code={code ? '' : undefined}
        style={{ transform: tape ? `translateX(${tapeX}px)` : `translateY(${-shift * 1.6}em)` }}
      >
        {Array.from({ length: count }, (_, i) => {
          const lineEnd = code?.breaks[i] === true;
          return (
            <Fragment key={i}>
              <Word
                index={i}
                target={state.words[i] ?? ''}
                typed={state.typed[i] ?? ''}
                left={i < current}
                blind={blind}
                indent={code?.indent[i] ?? 0}
                lineEnd={lineEnd}
              />
              {lineEnd && <span aria-hidden="true" className="code-break" />}
            </Fragment>
          );
        })}
      </div>
      <Caret viewportRef={viewportRef} state={state} shift={shift} tapeX={tapeX} smooth={caretSmooth} />
      {pace !== null && (
        <PaceCaret viewportRef={viewportRef} state={state} wpm={pace} shift={shift} tapeX={tapeX} />
      )}
      {ghost && state.status !== 'finished' && (
        <GhostCaret viewportRef={viewportRef} state={state} ghost={ghost} shift={shift} tapeX={tapeX} />
      )}
    </div>
  );
}
