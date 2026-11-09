/**
 * Keyboard layout emulation. The user types on a physical QWERTY keyboard, and the layout says which
 * character each physical key (`KeyboardEvent.code`) produces. Only the letter, digit and punctuation keys
 * are mapped; a code that is not in a layout's map is left alone.
 */

export type LayoutId = 'qwerty' | 'dvorak' | 'colemak' | 'colemak_dh' | 'workman' | 'azerty' | 'qwertz';

/** [normal, shifted] for one physical key. */
export type KeyPair = readonly [string, string];

export interface KeyboardLayout {
  name: string;
  map: Readonly<Record<string, KeyPair>>;
}

/**
 * The physical keys of an ANSI board, row by row, left to right. Each layout gives one normal string and
 * one shifted string per row, with one char per key in that order.
 */
const ANSI_ROWS: readonly (readonly string[])[] = [
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
    'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft',
    'BracketRight', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];
/** The extra key between left Shift and Z on ISO boards. */
const ISO_KEY = 'IntlBackslash';

/** Builds a layout map from one normal and one shifted string per row (plus the ISO key, if given). */
function build(rows: readonly [string, string][], iso?: KeyPair): Record<string, KeyPair> {
  const map: Record<string, KeyPair> = {};
  ANSI_ROWS.forEach((codes, r) => {
    const normal = Array.from(rows[r]?.[0] ?? '');
    const shifted = Array.from(rows[r]?.[1] ?? '');
    codes.forEach((code, i) => {
      map[code] = [normal[i] ?? '', shifted[i] ?? ''];
    });
  });
  if (iso) map[ISO_KEY] = iso;
  return map;
}

const QWERTY = build([
  ['`1234567890-=', '~!@#$%^&*()_+'],
  ['qwertyuiop[]\\', 'QWERTYUIOP{}|'],
  ["asdfghjkl;'", 'ASDFGHJKL:"'],
  ['zxcvbnm,./', 'ZXCVBNM<>?'],
]);

const DVORAK = build([
  ['`1234567890[]', '~!@#$%^&*(){}'],
  ["',.pyfgcrl/=\\", '"<>PYFGCRL?+|'],
  ["aoeuidhtns-", 'AOEUIDHTNS_'],
  [';qjkxbmwvz', ':QJKXBMWVZ'],
]);

const COLEMAK = build([
  ['`1234567890-=', '~!@#$%^&*()_+'],
  ['qwfpgjluy;[]\\', 'QWFPGJLUY:{}|'],
  ["arstdhneio'", 'ARSTDHNEIO"'],
  ['zxcvbkm,./', 'ZXCVBKM<>?'],
]);

const COLEMAK_DH = build([
  ['`1234567890-=', '~!@#$%^&*()_+'],
  ['qwfpbjluy;[]\\', 'QWFPBJLUY:{}|'],
  ["arstgmneio'", 'ARSTGMNEIO"'],
  ['zxcdvkh,./', 'ZXCDVKH<>?'],
]);

const WORKMAN = build([
  ['`1234567890-=', '~!@#$%^&*()_+'],
  ['qdrwbjfup;[]\\', 'QDRWBJFUP:{}|'],
  ["ashtgyneoi'", 'ASHTGYNEOI"'],
  ['zxmcvkl,./', 'ZXMCVKL<>?'],
]);

/** French AZERTY (ISO). */
const AZERTY = build(
  [
    ['²&é"\'(-è_çà)=', '³1234567890°+'],
    ['azertyuiop^$*', 'AZERTYUIOP¨£µ'],
    ['qsdfghjklmù', 'QSDFGHJKLM%'],
    ['wxcvbn,;:!', 'WXCVBN?./§'],
  ],
  ['<', '>'],
);

/** German QWERTZ (ISO). */
const QWERTZ = build(
  [
    ['^1234567890ß´', '°!"§$%&/()=?`'],
    ['qwertzuiopü+#', 'QWERTZUIOPÜ*\''],
    ['asdfghjklöä', 'ASDFGHJKLÖÄ'],
    ['yxcvbnm,.-', 'YXCVBNM;:_'],
  ],
  ['<', '>'],
);

export const LAYOUT_IDS: readonly LayoutId[] = ['qwerty', 'dvorak', 'colemak', 'colemak_dh', 'workman', 'azerty', 'qwertz'];

export const LAYOUTS: Readonly<Record<LayoutId, KeyboardLayout>> = {
  qwerty: { name: 'QWERTY', map: QWERTY },
  dvorak: { name: 'Dvorak', map: DVORAK },
  colemak: { name: 'Colemak', map: COLEMAK },
  colemak_dh: { name: 'Colemak-DH', map: COLEMAK_DH },
  workman: { name: 'Workman', map: WORKMAN },
  azerty: { name: 'AZERTY (French)', map: AZERTY },
  qwertz: { name: 'QWERTZ (German)', map: QWERTZ },
};

/**
 * The character a physical key (`KeyboardEvent.code`) produces in `layout`, or null when the layout does
 * not map that key. `shift` picks the shifted character.
 */
export function translateKey(layout: LayoutId, code: string, shift: boolean): string | null {
  const map = LAYOUTS[layout].map;
  if (!Object.hasOwn(map, code)) return null;
  return map[code]?.[shift ? 1 : 0] ?? null;
}
