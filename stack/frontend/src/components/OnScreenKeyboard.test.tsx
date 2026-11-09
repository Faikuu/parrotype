import { render } from '@testing-library/react';
import '@/i18n';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { keyForChar, legendOf, KEY_ROWS, FINGER_OF } from './keyboardLayout';

function keyEl(container: HTMLElement, code: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-key="${code}"]`);
  if (!el) throw new Error(`no key ${code}`);
  return el;
}

describe('OnScreenKeyboard', () => {
  it('highlights the next key only', () => {
    const { container } = render(<OnScreenKeyboard layout="qwerty" next="a" hints="next" />);
    expect(keyEl(container, 'KeyA').dataset.lit).toBe('');
    const lit = container.querySelectorAll('[data-lit]');
    expect(lit).toHaveLength(1);
  });

  it('lights Shift on the opposite hand for a capital letter', () => {
    const { container } = render(<OnScreenKeyboard layout="qwerty" next="A" hints="next" />);
    expect(keyEl(container, 'KeyA').dataset.lit).toBe('');
    // KeyA is typed by the left hand, so the right Shift is the one pressed.
    expect(keyEl(container, 'ShiftRight').dataset.lit).toBe('');
    expect(keyEl(container, 'ShiftLeft').dataset.lit).toBeUndefined();
  });

  it('highlights nothing when the hints are off or there is no next key', () => {
    const off = render(<OnScreenKeyboard layout="qwerty" next="a" hints="off" />);
    expect(off.container.querySelectorAll('[data-lit]')).toHaveLength(0);
    off.unmount();
    const none = render(<OnScreenKeyboard layout="qwerty" next={null} hints="next" />);
    expect(none.container.querySelectorAll('[data-lit]')).toHaveLength(0);
  });

  it('colours the keys by finger only in fingers mode', () => {
    const plain = render(<OnScreenKeyboard layout="qwerty" next={null} hints="next" />);
    expect(keyEl(plain.container, 'KeyF').getAttribute('style') ?? '').not.toContain('color-mix');
    plain.unmount();

    const { container } = render(<OnScreenKeyboard layout="qwerty" next={null} hints="fingers" />);
    expect(keyEl(container, 'KeyF').getAttribute('style')).toContain('color-mix(in srgb, var(--text)');
    // Left index and right index are different fingers, so their tints differ.
    expect(keyEl(container, 'KeyF').getAttribute('style')).not.toBe(keyEl(container, 'KeyK').getAttribute('style'));
  });

  it('draws the legends of the chosen layout on the same physical keys', () => {
    const { container } = render(<OnScreenKeyboard layout="dvorak" next="'" hints="next" />);
    expect(keyEl(container, 'KeyQ').textContent).toBe("'");
    expect(keyEl(container, 'KeyQ').dataset.lit).toBe('');
    expect(keyEl(container, 'KeyS').textContent).toBe('o');
  });

  it('is decorative and hidden on small screens', () => {
    const { container } = render(<OnScreenKeyboard layout="qwerty" next="a" hints="next" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.className).toContain('hidden');
    expect(root.className).toContain('sm:flex');
  });
});

describe('keyboardLayout', () => {
  it('maps a character to its key and shift state in a layout', () => {
    expect(keyForChar('qwerty', 'a')).toEqual({ code: 'KeyA', shift: false });
    expect(keyForChar('qwerty', 'A')).toEqual({ code: 'KeyA', shift: true });
    expect(keyForChar('qwerty', ' ')).toEqual({ code: 'Space', shift: false });
    expect(keyForChar('qwerty', '\n')).toEqual({ code: 'Enter', shift: false });
    expect(keyForChar('qwerty', '€')).toBeNull();
    expect(keyForChar('azerty', 'a')).toEqual({ code: 'KeyQ', shift: false });
  });

  it('draws every row to the same width, and gives every drawn key a finger or the thumb', () => {
    for (const row of KEY_ROWS.slice(0, 4)) {
      const width = row.reduce((sum, k) => sum + k.width, 0);
      expect(width).toBeCloseTo(15, 5);
    }
    for (const row of KEY_ROWS) {
      for (const key of row) {
        expect(FINGER_OF.has(key.code) || key.code === 'Space').toBe(true);
      }
    }
    expect(legendOf('qwerty', { code: 'Backspace', width: 2, label: 'Bksp' })).toBe('Bksp');
  });
});
