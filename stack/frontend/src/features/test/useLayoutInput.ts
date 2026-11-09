/**
 * Keyboard layout emulation, shared by the typing test, the race typing area and the Learn lessons.
 *
 * The user types on a physical QWERTY keyboard. When the `layout` setting is not qwerty, a keydown whose
 * physical key (`KeyboardEvent.code`) has a character in that layout is taken over: the native event is
 * prevented (so no beforeinput or input follows) and the translated character is passed to `onChar`.
 * Ctrl, Alt and Meta combinations, IME composition and unmapped keys (Space, Enter, Backspace, ...) are
 * left alone and the caller handles them as usual. That includes AltGr (Ctrl+Alt on Windows) and Option
 * (Alt on macOS): those combinations go to the native input, so the characters they type come from the
 * operating system's keyboard layout, not from the layout setting.
 *
 * CapsLock is honoured the way native typing does it: for a letter, CapsLock XOR Shift picks the case;
 * for any other key only Shift matters (CapsLock does not change digits or punctuation).
 *
 * Usage in a keydown handler:
 *
 *   const handleLayoutKey = useLayoutKeydown((ch) => typeText(ch));
 *   const onKeyDown = (e: KeyboardEvent) => {
 *     if (handleLayoutKey(e)) return;   // true: the event was handled and prevented
 *     ...                                // otherwise the usual handling
 *   };
 *
 * The returned function is stable across renders and reads the layout when it is called, so it can be
 * used from window listeners too. `layoutCharFor` is the pure part, for tests and other checks.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';
import { translateKey, type LayoutId } from '@/lib/text/layouts';
import { useSettings } from '@/store/settings';

export type LayoutKeyEvent = Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'isComposing'> & {
  getModifierState?: (key: string) => boolean;
};

/** The character a physical key types in `layout`, or null when the key is not remapped. */
export function layoutCharFor(layout: LayoutId, e: LayoutKeyEvent): string | null {
  if (layout === 'qwerty') return null;
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return null;
  const plain = translateKey(layout, e.code, false);
  if (plain === null) return null;
  const capsLock = e.getModifierState?.('CapsLock') ?? false;
  const isLetter = plain.toLowerCase() !== plain.toUpperCase();
  const upper = isLetter ? e.shiftKey !== capsLock : e.shiftKey;
  return translateKey(layout, e.code, upper);
}

/** See the module comment. Returns true when the event was handled (and prevented). */
export function useLayoutKeydown(onChar: (ch: string) => void): (e: KeyboardEvent) => boolean {
  const onCharRef = useRef(onChar);
  useLayoutEffect(() => {
    onCharRef.current = onChar;
  });
  return useCallback((e: KeyboardEvent) => {
    const ch = layoutCharFor(useSettings.getState().layout, e);
    if (ch === null) return false;
    e.preventDefault();
    onCharRef.current(ch);
    return true;
  }, []);
}
