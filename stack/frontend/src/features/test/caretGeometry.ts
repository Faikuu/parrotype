/*
 * Caret measurements shared by the main caret, the pace caret and tape mode.
 *
 * Positions are relative to the lines box (.test-lines). Its own transform (the line scroll, or the
 * tape translation) moves the letters and the box together, so the difference between a letter and the
 * box is the same whether or not the transition has finished. The caller adds the tape offset itself.
 */

export interface WordAnchor {
  /** Left edge of the caret, relative to the lines box (before any tape offset). */
  x: number;
  /** Width of the letter the caret sits on (used by block and underline carets). */
  width: number;
  /** Top of the word, relative to the viewport (includes the line scroll). */
  wordTop: number;
  wordHeight: number;
}

/** Where the active letter sits in tape mode: this fraction of the viewport width from the left. */
export const TAPE_ANCHOR = 0.4;

function letterEl(vp: HTMLElement, word: number, k: number): HTMLElement | null {
  return vp.querySelector<HTMLElement>(`[data-w="${word}"][data-c="${k}"]`);
}

/**
 * The caret position `pos` characters into word `index` (a word of `length` target letters). Before
 * the letter at `pos`, or after the letter before it when pos is at or past the end of the word.
 */
export function wordAnchor(vp: HTMLElement, index: number, pos: number, length: number): WordAnchor | null {
  const wordEl = vp.querySelector<HTMLElement>(`[data-word="${index}"]`);
  const lines = vp.querySelector<HTMLElement>('.test-lines');
  if (!wordEl || !lines) return null;

  const vr = vp.getBoundingClientRect();
  const lr = lines.getBoundingClientRect();
  const wr = wordEl.getBoundingClientRect();

  let x: number;
  let width: number;
  if (pos < length) {
    const el = letterEl(vp, index, pos);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    x = r.left - lr.left;
    width = r.width;
  } else if (pos > 0) {
    const el = letterEl(vp, index, pos - 1);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    x = r.right - lr.left;
    width = r.width;
  } else {
    const fontPx = parseFloat(getComputedStyle(vp).fontSize) || 16;
    x = wr.left - lr.left;
    width = fontPx * 0.6;
  }
  return { x, width, wordTop: wr.top - vr.top, wordHeight: wr.height };
}

/**
 * The same position as wordAnchor, from layout offsets only (no transforms, so no transitions). Used to
 * work out the tape offset before it is applied.
 */
export function layoutX(vp: HTMLElement, index: number, pos: number, length: number): number | null {
  const wordEl = vp.querySelector<HTMLElement>(`[data-word="${index}"]`);
  if (!wordEl) return null;
  if (pos < length) {
    const el = letterEl(vp, index, pos);
    return el ? el.offsetLeft : null;
  }
  if (pos > 0) {
    const el = letterEl(vp, index, pos - 1);
    return el ? el.offsetLeft + el.offsetWidth : null;
  }
  return wordEl.offsetLeft;
}

/** The tape offset (px, never positive) that puts the anchor at TAPE_ANCHOR of the viewport width. */
export function tapeOffsetFor(viewportWidth: number, anchorX: number): number {
  return Math.round(Math.min(0, viewportWidth * TAPE_ANCHOR - anchorX));
}
