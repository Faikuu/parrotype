import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import { elapsedMs } from '@/lib/engine/engine';
import type { CodeLines, EngineEvent, EngineState, TestConfig } from '@/lib/engine/types';
import { wordAnchor } from './caretGeometry';
import { createPositionCursor } from './replayCursor';

/** A finished run that a ghost replays: its settings, target words, events and (code mode) line structure. */
export interface GhostRun {
  config: TestConfig;
  words: string[];
  events: EngineEvent[];
  code?: CodeLines;
}

export interface GhostCaretProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  state: EngineState;
  ghost: GhostRun;
  /** Lines scrolled off the top (a change means a jump, not a glide). */
  shift: number;
  /** Horizontal tape offset in px (0 outside tape mode). */
  tapeX: number;
}

const TICK_MS = 100;
const BOX_EM = 1;
/** Pushed down a little so the ghost and the pace caret, which can share a position, both stay visible. */
const OFFSET_EM = 0.14;

/**
 * Where a previous run's caret is at this moment of the live test (the same text, replayed from the
 * ghost's events). Thinner and fainter than the main caret, and not part of the typing UI.
 */
export function GhostCaret({ viewportRef, state, ghost, shift, tapeX }: GhostCaretProps) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef<{ shift: number } | null>(null);
  const running = state.status === 'running';
  const [now, setNow] = useState(() => Date.now());
  // On mount the parent's viewport ref is not attached yet when the layout effect below first runs, so it
  // places itself again once the mount has settled.
  const [, placeAgain] = useReducer((n: number) => n + 1, 0);
  useEffect(() => placeAgain(), []);

  // Replays the ghost's events incrementally: each tick applies only the events since the last one. A new
  // ghost (different events, words or config) starts a new cursor.
  const positions = useMemo(
    () => createPositionCursor(ghost.config, ghost.words, ghost.events, ghost.code ? { code: ghost.code } : undefined),
    [ghost.config, ghost.words, ghost.events, ghost.code],
  );

  // Its own clock while the test runs, like the pace caret.
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

    const pos = positions.at(elapsedMs(state, now));
    const targetLen = state.words[pos.word]?.length ?? ghost.words[pos.word]?.length ?? 0;
    const box = wordAnchor(vp, pos.word, Math.min(pos.char, targetLen), targetLen);
    if (!box) {
      el.style.display = 'none';
      return;
    }

    const fontPx = parseFloat(getComputedStyle(vp).fontSize) || 16;
    const height = BOX_EM * fontPx;
    const jumped = placed.current === null || placed.current.shift !== shift;
    el.style.display = '';
    el.style.height = `${height}px`;
    el.style.transition = jumped ? 'none' : 'transform 100ms linear';
    el.style.transform = `translate(${box.x + tapeX}px, ${box.wordTop + (box.wordHeight - height) / 2 + OFFSET_EM * fontPx}px)`;
    placed.current = { shift };
  });

  return <div ref={ref} aria-hidden="true" data-ghost="" className="test-ghost-caret" style={{ display: 'none' }} />;
}
