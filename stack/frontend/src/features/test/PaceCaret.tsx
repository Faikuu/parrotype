import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { elapsedMs } from '@/lib/engine/engine';
import { pacePosition } from '@/lib/engine/pace';
import type { EngineState } from '@/lib/engine/types';
import { wordAnchor } from './caretGeometry';

export interface PaceCaretProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  state: EngineState;
  /** Target wpm, or null to hide the caret. */
  wpm: number | null;
  /** Lines scrolled off the top (a change means a jump, not a glide). */
  shift: number;
  /** Horizontal tape offset in px (0 outside tape mode). */
  tapeX: number;
}

const TICK_MS = 100;
const BOX_EM = 1.15;
const GLIDE = 'transform 100ms linear';

/**
 * A faint second caret that walks the text at the pace target (see pacePosition), so you can see
 * whether you are ahead of or behind that speed. Shown only while a test runs.
 */
export function PaceCaret({ viewportRef, state, wpm, shift, tapeX }: PaceCaretProps) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef<{ shift: number } | null>(null);
  const running = state.status === 'running' && wpm !== null && state.config.mode !== 'zen' && state.config.mode !== 'custom';
  const [now, setNow] = useState(() => Date.now());

  // Its own clock: the test state only changes on keystrokes and seconds, the caret moves every tick.
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const el = ref.current;
    if (!vp || !el) return;

    const pos = running && wpm !== null ? pacePosition(state.words, wpm, elapsedMs(state, now)) : null;
    const word = pos ? state.words[pos.word] : undefined;
    const box = pos && word !== undefined ? wordAnchor(vp, pos.word, pos.char, word.length) : null;
    if (!box) {
      el.style.display = 'none';
      return;
    }

    const fontPx = parseFloat(getComputedStyle(vp).fontSize) || 16;
    const height = BOX_EM * fontPx;
    const jumped = placed.current === null || placed.current.shift !== shift;
    el.style.display = '';
    el.style.height = `${height}px`;
    el.style.transition = jumped ? 'none' : GLIDE;
    el.style.transform = `translate(${box.x + tapeX}px, ${box.wordTop + (box.wordHeight - height) / 2}px)`;
    placed.current = { shift };
  });

  return <div ref={ref} aria-hidden="true" className="test-pace-caret" style={{ display: 'none' }} />;
}
