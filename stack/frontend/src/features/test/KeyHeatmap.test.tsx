import { render, screen } from '@testing-library/react';
import '@/i18n';
import { KeyHeatmap } from './KeyHeatmap';

function keyEl(ch: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-key="${ch}"]`);
  if (!el) throw new Error(`no key ${ch}`);
  return el;
}

describe('KeyHeatmap', () => {
  it('renders the QWERTY rows and the heading', () => {
    render(<KeyHeatmap stats={{}} language="en" />);
    expect(screen.getByRole('heading', { name: 'Missed keys' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-key]')).toHaveLength(26);
    expect(keyEl('q')).toBeInTheDocument();
    expect(keyEl('m')).toBeInTheDocument();
  });

  it('adds the extra letters for pl, de and es and nothing for en', () => {
    const { unmount } = render(<KeyHeatmap stats={{}} language="pl" />);
    expect(document.querySelectorAll('[data-key]')).toHaveLength(26 + 9);
    expect(keyEl('ł')).toBeInTheDocument();
    unmount();

    const de = render(<KeyHeatmap stats={{}} language="de" />);
    expect(keyEl('ß')).toBeInTheDocument();
    de.unmount();

    render(<KeyHeatmap stats={{}} language="es" />);
    expect(keyEl('ñ')).toBeInTheDocument();
  });

  it('gives each key a tooltip with its hits and misses', () => {
    render(<KeyHeatmap stats={{ q: { hits: 12, misses: 3 } }} language="en" />);
    expect(keyEl('q').getAttribute('title')).toBe('q: 12 hits, 3 misses');
    expect(keyEl('w').getAttribute('title')).toBe('w: 0 hits, 0 misses');
  });

  it('mixes the background from --surface to --error by miss rate', () => {
    render(<KeyHeatmap stats={{ q: { hits: 3, misses: 1 } }} language="en" />);
    expect(keyEl('q').style.background).toContain('color-mix(in oklab, var(--error) 25.0%, var(--surface))');
    expect(keyEl('q').style.opacity).toBe('1');
  });

  it('fades keys with no data to half opacity', () => {
    render(<KeyHeatmap stats={{ q: { hits: 1, misses: 0 } }} language="en" />);
    expect(keyEl('a').style.opacity).toBe('0.5');
    expect(keyEl('q').style.opacity).toBe('1');
  });
});

describe('KeyHeatmap with a layout', () => {
  it('labels each physical key with the layout character (Dvorak: the QWERTY S key is o)', () => {
    render(<KeyHeatmap stats={{}} language="en" layout="dvorak" />);
    const row = keyEl('o').parentElement!;
    // Dvorak's home row starts a, o, e, u, i, ...: the QWERTY A, S, D, F keys.
    expect(Array.from(row.children).slice(0, 4).map((el) => el.getAttribute('data-key'))).toEqual(['a', 'o', 'e', 'u']);
    expect(document.querySelector('[data-key="s"]')).toBeNull();
  });

  it('keeps the QWERTY letters for the default layout', () => {
    render(<KeyHeatmap stats={{}} language="en" />);
    expect(document.querySelector('[data-key="s"]')).not.toBeNull();
  });
});
