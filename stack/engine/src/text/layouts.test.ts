import { describe, it, expect } from 'vitest';
import { LAYOUTS, LAYOUT_IDS, translateKey, type LayoutId } from './layouts';

const LETTER_CODES = Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`);

describe('layouts', () => {
  it('has all seven layouts with names', () => {
    expect(LAYOUT_IDS).toEqual(['qwerty', 'dvorak', 'colemak', 'colemak_dh', 'workman', 'azerty', 'qwertz']);
    for (const id of LAYOUT_IDS) expect(LAYOUTS[id].name.length).toBeGreaterThan(0);
  });

  it('qwerty maps every letter code to its own letter, normal and shifted', () => {
    for (const code of LETTER_CODES) {
      const letter = code.slice(3).toLowerCase();
      expect(translateKey('qwerty', code, false)).toBe(letter);
      expect(translateKey('qwerty', code, true)).toBe(letter.toUpperCase());
    }
  });

  it('every layout places each of the 26 letters on exactly one key, shifted to its capital', () => {
    // Real layouts put punctuation on some letter keys (Dvorak's Q is an apostrophe), so the check is over
    // the keys that produce a letter, not over the letter codes.
    for (const id of LAYOUT_IDS) {
      const letterKeys = Object.keys(LAYOUTS[id].map).filter((code) => /^[a-z]$/.test(translateKey(id, code, false) ?? ''));
      const letters = letterKeys.map((code) => translateKey(id, code, false)).sort().join('');
      expect(letters, id).toBe('abcdefghijklmnopqrstuvwxyz');
      for (const code of letterKeys) {
        expect(translateKey(id, code, true), `${id} ${code} shifted`).toBe(translateKey(id, code, false)?.toUpperCase());
      }
    }
  });

  it('every mapped pair is a single character, normal and shifted', () => {
    for (const id of LAYOUT_IDS) {
      for (const [code, [normal, shifted]] of Object.entries(LAYOUTS[id].map)) {
        expect([...normal], `${id} ${code}`).toHaveLength(1);
        expect([...shifted], `${id} ${code}`).toHaveLength(1);
      }
    }
  });

  it('qwerty is the identity on every mapped key', () => {
    for (const [code, [normal, shifted]] of Object.entries(LAYOUTS.qwerty.map)) {
      expect(translateKey('qwerty', code, false)).toBe(normal);
      expect(translateKey('qwerty', code, true)).toBe(shifted);
    }
    expect(translateKey('qwerty', 'KeyQ', false)).toBe('q');
    expect(translateKey('qwerty', 'Digit7', true)).toBe('&');
  });

  it('returns null for keys the layout does not map (and for prototype names)', () => {
    expect(translateKey('dvorak', 'Space', false)).toBeNull();
    expect(translateKey('azerty', 'Enter', false)).toBeNull();
    expect(translateKey('qwerty', 'constructor', false)).toBeNull();
    expect(translateKey('qwerty', 'toString', true)).toBeNull();
  });

  it('dvorak spot checks', () => {
    expect(translateKey('dvorak', 'KeyQ', false)).toBe("'");
    expect(translateKey('dvorak', 'KeyQ', true)).toBe('"');
    expect(translateKey('dvorak', 'KeyS', false)).toBe('o');
    expect(translateKey('dvorak', 'KeyD', false)).toBe('e');
    expect(translateKey('dvorak', 'KeyZ', false)).toBe(';');
    expect(translateKey('dvorak', 'KeyV', false)).toBe('k');
    expect(translateKey('dvorak', 'Minus', false)).toBe('[');
    expect(translateKey('dvorak', 'Minus', true)).toBe('{');
    expect(translateKey('dvorak', 'Slash', false)).toBe('z');
    expect(translateKey('dvorak', 'Digit1', true)).toBe('!');
  });

  it('colemak and colemak-dh spot checks', () => {
    expect(translateKey('colemak', 'KeyE', false)).toBe('f');
    expect(translateKey('colemak', 'KeyE', true)).toBe('F');
    expect(translateKey('colemak', 'KeyK', false)).toBe('e');
    expect(translateKey('colemak', 'KeyP', false)).toBe(';');
    expect(translateKey('colemak', 'KeyS', false)).toBe('r');
    expect(translateKey('colemak', 'KeyN', false)).toBe('k');
    expect(translateKey('colemak', 'Semicolon', false)).toBe('o');
    expect(translateKey('colemak_dh', 'KeyT', false)).toBe('b');
    expect(translateKey('colemak_dh', 'KeyH', false)).toBe('m');
    expect(translateKey('colemak_dh', 'KeyM', false)).toBe('h');
    expect(translateKey('colemak_dh', 'KeyN', false)).toBe('k');
    expect(translateKey('colemak_dh', 'KeyV', false)).toBe('d');
  });

  it('workman spot checks', () => {
    expect(translateKey('workman', 'KeyQ', false)).toBe('q');
    expect(translateKey('workman', 'KeyW', false)).toBe('d');
    expect(translateKey('workman', 'KeyE', false)).toBe('r');
    expect(translateKey('workman', 'KeyR', false)).toBe('w');
    expect(translateKey('workman', 'KeyH', false)).toBe('y');
    expect(translateKey('workman', 'KeyM', false)).toBe('l');
    expect(translateKey('workman', 'Comma', true)).toBe('<');
  });

  it('azerty spot checks (French, ISO)', () => {
    expect(translateKey('azerty', 'KeyQ', false)).toBe('a');
    expect(translateKey('azerty', 'KeyQ', true)).toBe('A');
    expect(translateKey('azerty', 'KeyA', false)).toBe('q');
    expect(translateKey('azerty', 'KeyW', false)).toBe('z');
    expect(translateKey('azerty', 'KeyZ', false)).toBe('w');
    expect(translateKey('azerty', 'KeyM', false)).toBe(',');
    expect(translateKey('azerty', 'Semicolon', false)).toBe('m');
    expect(translateKey('azerty', 'Digit1', false)).toBe('&');
    expect(translateKey('azerty', 'Digit1', true)).toBe('1');
    expect(translateKey('azerty', 'Digit2', false)).toBe('é');
    expect(translateKey('azerty', 'Digit2', true)).toBe('2');
    expect(translateKey('azerty', 'Quote', false)).toBe('ù');
    expect(translateKey('azerty', 'IntlBackslash', false)).toBe('<');
  });

  it('qwertz spot checks (German, ISO)', () => {
    expect(translateKey('qwertz', 'KeyY', false)).toBe('z');
    expect(translateKey('qwertz', 'KeyY', true)).toBe('Z');
    expect(translateKey('qwertz', 'KeyZ', false)).toBe('y');
    expect(translateKey('qwertz', 'Digit7', false)).toBe('7');
    expect(translateKey('qwertz', 'Digit7', true)).toBe('/');
    expect(translateKey('qwertz', 'Digit2', true)).toBe('"');
    expect(translateKey('qwertz', 'Minus', false)).toBe('ß');
    expect(translateKey('qwertz', 'Semicolon', false)).toBe('ö');
    expect(translateKey('qwertz', 'Quote', false)).toBe('ä');
    expect(translateKey('qwertz', 'BracketLeft', false)).toBe('ü');
    expect(translateKey('qwertz', 'Slash', false)).toBe('-');
    expect(translateKey('qwertz', 'Slash', true)).toBe('_');
  });

  it('layouts are typed the same way for their shifted digit keys (no letter collides with a digit)', () => {
    for (const id of LAYOUT_IDS) {
      const used = new Set<string>();
      for (const code of LETTER_CODES) used.add(translateKey(id, code, false) ?? '');
      for (let d = 1; d <= 9; d++) expect(used.has(String(d)), `${id} ${d}`).toBe(false);
    }
  });

  it('LayoutId covers the names used in the map', () => {
    const ids: LayoutId[] = [...LAYOUT_IDS];
    expect(Object.keys(LAYOUTS).sort()).toEqual([...ids].sort());
  });
});
