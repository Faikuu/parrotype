import { renderHook } from '@testing-library/react';
import { layoutCharFor, useLayoutKeydown } from './useLayoutInput';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, ...init });
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
