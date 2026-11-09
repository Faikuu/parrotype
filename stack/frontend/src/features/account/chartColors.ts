export interface ChartPalette {
  main: string;
  sub: string;
  surface: string;
  text: string;
  bg: string;
}

const FALLBACK: ChartPalette = {
  main: '#9db35f',
  sub: '#6f7562',
  surface: '#272c22',
  text: '#e4e3d3',
  bg: '#1d2119',
};

/** Reads the current theme tokens from the document. Call after applyTheme has run. */
export function readChartPalette(): ChartPalette {
  if (typeof document === 'undefined') return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    main: read('--main', FALLBACK.main),
    sub: read('--sub', FALLBACK.sub),
    surface: read('--surface', FALLBACK.surface),
    text: read('--text', FALLBACK.text),
    bg: read('--bg', FALLBACK.bg),
  };
}

/**
 * Canvas colours need a parseable value (chart.js doesn't resolve color-mix), so convert
 * hex and rgb() tokens to rgba with the given alpha. Other formats are returned unchanged.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex) {
    let h = hex[1] ?? '';
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (rgb) {
    const parts = (rgb[1] ?? '').split(/[\s,/]+/).filter(Boolean);
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  return color;
}
