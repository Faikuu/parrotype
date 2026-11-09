/**
 * Keyboard layout emulation, shared by the typing test, the race typing area and the Learn lessons.
 *
 * The user types on a physical QWERTY keyboard. When the `layout` setting is not qwerty, a keydown whose
 * physical key (`KeyboardEvent.code`) has a character in that layout is taken over: the native event is
 * prevented (so no beforeinput or input follows) and the translated character is passed to `onChar`.
 * Ctrl, Alt and Meta combinations, IME composition and unmapped keys (Space, Enter, Backspace, ...) are
 * left alone and the caller handles them as usual.
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

export type LayoutKeyEvent = Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'isComposing'>;

/** The character a physical key types in `layout`, or null when the key is not remapped. */
export function layoutCharFor(layout: LayoutId, e: LayoutKeyEvent): string | null {
  if (layout === 'qwerty') return null;
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return null;
  const ch = translateKey(layout, e.code, e.shiftKey);
  return ch ? ch : null;
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
