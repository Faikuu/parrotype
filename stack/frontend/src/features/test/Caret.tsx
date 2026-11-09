import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/components/cn';
import type { EngineState } from '@/lib/engine/types';
import { useSettings } from '@/store/settings';
import { wordAnchor } from './caretGeometry';

export interface CaretProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  state: EngineState;
  /** Lines scrolled off the top; a change means the caret jumps rather than glides. */
  shift: number;
  /** Horizontal tape offset in px (0 outside tape mode). */
  tapeX?: number;
  /** Overrides the smooth caret setting (the replay player turns the glide off for reduced motion). */
  smooth?: boolean;
}

const IDLE_MS = 1000;
const GLIDE = 'transform 90ms linear';
const LINE_WIDTH = 3;
const UNDERLINE_HEIGHT = 3;
const BOX_EM = 1.15;

/**
 * The single bold element of the test. Sits on the next letter (or after the last typed letter),
 * glides between letters, and breathes while idle.
 */
export function Caret({ viewportRef, state, shift, tapeX = 0, smooth: smoothOverride }: CaretProps) {
  const caretStyle = useSettings((s) => s.caretStyle);
  const smoothSetting = useSettings((s) => s.smoothCaret);
  const smooth = smoothOverride ?? smoothSetting;
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef<{ shift: number } | null>(null);
  const [, setTick] = useState(0);
  const [idle, setIdle] = useState(true);

  const running = state.status === 'running';
  const lastKeyAt = state.keystrokes[state.keystrokes.length - 1]?.at ?? null;

  // Breathe when idle or when no key was pressed for a second.
  useEffect(() => {
    if (!running) {
      setIdle(true);
      return;
    }
    setIdle(false);
    const id = setTimeout(() => setIdle(true), IDLE_MS);
    return () => clearTimeout(id);
  }, [running, lastKeyAt]);

  // Re-place on resize (the words reflow).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setTick((n) => n + 1));
    ro.observe(vp);
    return () => ro.disconnect();
  }, [viewportRef]);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const el = ref.current;
    if (!vp || !el) return;

    const hide = () => {
      el.style.display = 'none';
    };
    if (caretStyle === 'off' || state.status === 'finished') return hide();

    const cur = state.current;
    const typed = state.typed[cur] ?? '';
    const target = state.words[cur] ?? '';
    const pos = wordAnchor(vp, cur, typed.length, target.length);
    if (!pos) return hide();
    const fontPx = parseFloat(getComputedStyle(vp).fontSize) || 16;
    const x = pos.x + tapeX;
    const w = pos.width;

    el.style.display = '';
    let width: number;
    let height: number;
    let left: number;
    let top: number;
    const wordTop = pos.wordTop;
    if (caretStyle === 'line') {
      width = LINE_WIDTH;
      height = BOX_EM * fontPx;
      left = x;
      top = wordTop + (pos.wordHeight - height) / 2;
    } else if (caretStyle === 'block') {
      width = w;
      height = BOX_EM * fontPx;
      left = x;
      top = wordTop + (pos.wordHeight - height) / 2;
    } else {
      width = w;
      height = UNDERLINE_HEIGHT;
      left = x;
      top = wordTop + pos.wordHeight / 2 + 0.5 * fontPx;
    }

    // Jumps (line scroll) and first placement should not glide.
    const jumped = placed.current === null || placed.current.shift !== shift;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.transition = smooth && !jumped ? GLIDE : 'none';
    el.style.transform = `translate(${left}px, ${top}px)`;
    placed.current = { shift };
  });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-style={caretStyle}
      className={cn('test-caret', idle && 'caret-breathe')}
    />
  );
}
