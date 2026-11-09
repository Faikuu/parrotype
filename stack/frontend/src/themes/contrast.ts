/**
 * WCAG 2 contrast helpers for the custom theme editor. Colours are `#rrggbb` (validated by the caller).
 */

/** Minimum contrast for the main text and for secondary (sub) text on the background (WCAG AA). */
export const CONTRAST_MIN = { text: 4.5, sub: 3 } as const;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, from 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** True when black text reads better on the colour than white text does. */
export function isLightColour(hex: string): boolean {
  return contrastRatio(hex, '#000000') > contrastRatio(hex, '#ffffff');
}

export interface ContrastWarning {
  pair: 'text' | 'sub';
  ratio: number;
  min: number;
}

/** Warnings for the text and sub colours against the background (empty when both pass). */
export function contrastWarnings(tokens: { bg: string; text: string; sub: string }): ContrastWarning[] {
  const out: ContrastWarning[] = [];
  const text = contrastRatio(tokens.text, tokens.bg);
  if (text < CONTRAST_MIN.text) out.push({ pair: 'text', ratio: round1(text), min: CONTRAST_MIN.text });
  const sub = contrastRatio(tokens.sub, tokens.bg);
  if (sub < CONTRAST_MIN.sub) out.push({ pair: 'sub', ratio: round1(sub), min: CONTRAST_MIN.sub });
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
