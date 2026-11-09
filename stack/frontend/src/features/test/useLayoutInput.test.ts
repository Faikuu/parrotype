import { renderHook } from '@testing-library/react';
import { layoutCharFor, useLayoutKeydown } from './useLayoutInput';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';

function keyEvent(init: KeyboardEventInit, capsLock = false): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { cancelable: true, ...init });
  Object.defineProperty(e, 'getModifierState', {
    value: (key: string) => key === 'CapsLock' && capsLock,
  });
  return e;
}

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS, layout: 'qwerty' });
});

describe('layoutCharFor', () => {
  it('leaves QWERTY alone, so the native input handles every key', () => {
    expect(layoutCharFor('qwerty', { code: 'KeyS', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false })).toBeNull();
  });

  it('maps letters to the layout character at the physical key', () => {
    const base = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false };
    expect(layoutCharFor('dvorak', { ...base, code: 'KeyS' })).toBe('o');
    expect(layoutCharFor('dvorak', { ...base, code: 'KeyS', shiftKey: true })).toBe('O');
    expect(layoutCharFor('colemak', { ...base, code: 'KeyE' })).toBe('f');
    expect(layoutCharFor('azerty', { ...base, code: 'KeyQ' })).toBe('a');
    expect(layoutCharFor('qwertz', { ...base, code: 'KeyY' })).toBe('z');
  });

  it('skips shortcuts, IME composition and keys the layout does not map', () => {
    const base = { code: 'KeyS', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false };
    expect(layoutCharFor('dvorak', { ...base, ctrlKey: true })).toBeNull();
    expect(layoutCharFor('dvorak', { ...base, metaKey: true })).toBeNull();
    expect(layoutCharFor('dvorak', { ...base, altKey: true })).toBeNull();
    expect(layoutCharFor('dvorak', { ...base, isComposing: true })).toBeNull();
    expect(layoutCharFor('dvorak', { ...base, code: 'Space' })).toBeNull();
    expect(layoutCharFor('dvorak', { ...base, code: 'Enter' })).toBeNull();
  });
});

describe('CapsLock', () => {
  const base = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false };

  it('CapsLock alone uppercases letters', () => {
    expect(layoutCharFor('dvorak', { ...base, code: 'KeyS', getModifierState: (k) => k === 'CapsLock' })).toBe('O');
  });

  it('CapsLock with Shift gives lowercase letters, as native typing does', () => {
    expect(layoutCharFor('dvorak', { ...base, code: 'KeyS', shiftKey: true, getModifierState: (k) => k === 'CapsLock' })).toBe('o');
  });

  it('CapsLock does not change digits or punctuation', () => {
    const caps = (k: string) => k === 'CapsLock';
    expect(layoutCharFor('dvorak', { ...base, code: 'Digit1', getModifierState: caps })).toBe('1');
    expect(layoutCharFor('dvorak', { ...base, code: 'Digit1', shiftKey: true, getModifierState: caps })).toBe('!');
  });

  it('is honoured through the keydown handler', () => {
    useSettings.setState({ layout: 'dvorak' });
    const onChar = vi.fn();
    const { result } = renderHook(() => useLayoutKeydown(onChar));
    expect(result.current(keyEvent({ code: 'KeyS', key: 'S' }, true))).toBe(true);
    expect(result.current(keyEvent({ code: 'KeyS', key: 's', shiftKey: true }, true))).toBe(true);
    expect(result.current(keyEvent({ code: 'Digit1', key: '1' }, true))).toBe(true);
    expect(onChar.mock.calls.map((c) => c[0])).toEqual(['O', 'o', '1']);
  });

  it('leaves AltGr (Ctrl+Alt) and Option (Alt) combinations to native input', () => {
    const onChar = vi.fn();
    useSettings.setState({ layout: 'dvorak' });
    const { result } = renderHook(() => useLayoutKeydown(onChar));
    const altgr = keyEvent({ code: 'KeyS', key: 'ß', ctrlKey: true, altKey: true });
    expect(result.current(altgr)).toBe(false);
    expect(altgr.defaultPrevented).toBe(false);
    expect(result.current(keyEvent({ code: 'KeyS', key: 'ß', altKey: true }))).toBe(false);
    expect(onChar).not.toHaveBeenCalled();
  });
});

describe('useLayoutKeydown', () => {
  it('under Dvorak, pressing the QWERTY S key types o and prevents the native key', () => {
    useSettings.setState({ layout: 'dvorak' });
    const onChar = vi.fn();
    const { result } = renderHook(() => useLayoutKeydown(onChar));

    const e = keyEvent({ code: 'KeyS', key: 's' });
    expect(result.current(e)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(onChar).toHaveBeenCalledWith('o');
  });

  it('returns false and does nothing for keys it does not remap', () => {
    useSettings.setState({ layout: 'dvorak' });
    const onChar = vi.fn();
    const { result } = renderHook(() => useLayoutKeydown(onChar));

    const space = keyEvent({ code: 'Space', key: ' ' });
    expect(result.current(space)).toBe(false);
    expect(space.defaultPrevented).toBe(false);
    expect(onChar).not.toHaveBeenCalled();
  });

  it('does nothing under QWERTY', () => {
    const onChar = vi.fn();
    const { result } = renderHook(() => useLayoutKeydown(onChar));
    expect(result.current(keyEvent({ code: 'KeyS', key: 's' }))).toBe(false);
    expect(onChar).not.toHaveBeenCalled();
  });

  it('reads the layout when the key is pressed, and calls the latest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ cb }) => useLayoutKeydown(cb), { initialProps: { cb: first } });
    rerender({ cb: second });
    useSettings.setState({ layout: 'workman' });

    // Workman puts 'e' on the QWERTY K key.
    expect(result.current(keyEvent({ code: 'KeyK', key: 'k' }))).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('e');
  });
});
