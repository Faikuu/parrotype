import { LAYOUTS, type LayoutId } from '@/lib/text/layouts';

/** A key on the drawn board: its physical code (KeyboardEvent.code), its width in key units, and its legend. */
export interface KeyDef {
  code: string;
  width: number;
  /** Legend for the keys that type no character (or none in this layout). */
  label?: string;
}

const row = (codes: readonly string[]): KeyDef[] => codes.map((code) => ({ code, width: 1 }));
const digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const top = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
const home = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'];
const bottom = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'];

/**
 * The ANSI board, row by row. Every row is 15 key units wide, except the space row. The legends come from the
 * layout (see LAYOUTS), so a Dvorak user sees Dvorak letters on the same physical keys.
 */
export const KEY_ROWS: readonly (readonly KeyDef[])[] = [
  [{ code: 'Backquote', width: 1 }, ...row(digits), { code: 'Minus', width: 1 }, { code: 'Equal', width: 1 }, { code: 'Backspace', width: 2, label: 'Bksp' }],
  [{ code: 'Tab', width: 1.5, label: 'Tab' }, ...row(top), { code: 'BracketLeft', width: 1 }, { code: 'BracketRight', width: 1 }, { code: 'Backslash', width: 1.5 }],
  [{ code: 'CapsLock', width: 1.75, label: 'Caps' }, ...row(home), { code: 'Semicolon', width: 1 }, { code: 'Quote', width: 1 }, { code: 'Enter', width: 2.25, label: 'Enter' }],
  [{ code: 'ShiftLeft', width: 2.25, label: 'Shift' }, ...row(bottom), { code: 'Comma', width: 1 }, { code: 'Period', width: 1 }, { code: 'Slash', width: 1 }, { code: 'ShiftRight', width: 2.75, label: 'Shift' }],
  [{ code: 'Space', width: 6.25, label: 'Space' }],
];

/** The eight fingers and the thumb, by the QWERTY key each one reaches for. */
export type Finger = 'lp' | 'lr' | 'lm' | 'li' | 'ri' | 'rm' | 'rr' | 'rp' | 'thumb';

const FINGER_KEYS: Record<Exclude<Finger, 'thumb'>, readonly string[]> = {
  lp: ['Backquote', 'Digit1', 'Tab', 'KeyQ', 'CapsLock', 'KeyA', 'ShiftLeft', 'KeyZ'],
  lr: ['Digit2', 'KeyW', 'KeyS', 'KeyX'],
  lm: ['Digit3', 'KeyE', 'KeyD', 'KeyC'],
  li: ['Digit4', 'Digit5', 'KeyR', 'KeyT', 'KeyF', 'KeyG', 'KeyV', 'KeyB'],
  ri: ['Digit6', 'Digit7', 'KeyY', 'KeyU', 'KeyH', 'KeyJ', 'KeyN', 'KeyM'],
  rm: ['Digit8', 'KeyI', 'KeyK', 'Comma'],
  rr: ['Digit9', 'KeyO', 'KeyL', 'Period'],
  rp: ['Digit0', 'Minus', 'Equal', 'KeyP', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Slash', 'Backslash', 'Backspace', 'Enter', 'ShiftRight'],
};

/** The finger that presses a physical key (QWERTY positions, whatever the layout's legends). */
export const FINGER_OF: ReadonlyMap<string, Finger> = new Map<string, Finger>([
  ...(Object.keys(FINGER_KEYS) as (keyof typeof FINGER_KEYS)[]).flatMap((f) => FINGER_KEYS[f].map((code) => [code, f] as const)),
  ['Space', 'thumb'],
]);

/**
 * The colour of each finger: a theme token mixed lightly into the surface, so the tint stays subtle in every
 * theme. The thumb uses the plain surface.
 */
export const FINGER_COLOUR: Record<Finger, string> = {
  lp: 'color-mix(in srgb, var(--error) 14%, var(--surface))',
  lr: 'color-mix(in srgb, var(--caret) 14%, var(--surface))',
  lm: 'color-mix(in srgb, var(--main) 15%, var(--surface))',
  li: 'color-mix(in srgb, var(--text) 9%, var(--surface))',
  ri: 'color-mix(in srgb, var(--error-extra) 20%, var(--surface))',
  rm: 'color-mix(in srgb, var(--caret) 22%, var(--surface))',
  rr: 'color-mix(in srgb, var(--main) 22%, var(--surface))',
  rp: 'color-mix(in srgb, var(--text) 13%, var(--surface))',
  thumb: 'var(--surface)',
};

/** The legend a key shows in `layout`: its unshifted character, or the key's own label. */
export function legendOf(layout: LayoutId, def: KeyDef): string {
  if (def.label !== undefined) return def.label;
  return LAYOUTS[layout].map[def.code]?.[0] ?? '';
}

/**
 * The physical key that types `char` in `layout`, and whether Shift is needed. Null when no key types it (for
 * example a character from another alphabet). A space is the Space key and a newline the Enter key.
 */
export function keyForChar(layout: LayoutId, char: string): { code: string; shift: boolean } | null {
  if (char === ' ') return { code: 'Space', shift: false };
  if (char === '\n') return { code: 'Enter', shift: false };
  const map = LAYOUTS[layout].map;
  for (const [code, [plain, shifted]] of Object.entries(map)) {
    if (plain === char) return { code, shift: false };
    if (shifted === char) return { code, shift: true };
  }
  return null;
}

/** The Shift key on the opposite hand from `code`, the one a touch typist uses to type `code` shifted. */
export function shiftKeyFor(code: string): string {
  const finger = FINGER_OF.get(code);
  return finger !== undefined && finger.startsWith('r') ? 'ShiftLeft' : 'ShiftRight';
}
