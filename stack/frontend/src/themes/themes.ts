import { isLightColour } from './contrast';

export type ThemeId =
  | 'kea'
  | 'kakapo'
  | 'macaw'
  | 'cockatoo'
  | 'galah'
  | 'lorikeet'
  | 'budgie'
  | 'cacatua-noir'
  | 'high-contrast';

export type FontId = 'spline' | 'redhat' | 'atkinson' | 'fragment' | 'sometype' | 'opendyslexic';

export interface ThemeTokens {
  bg: string;
  surface: string;
  text: string;
  sub: string;
  main: string;
  caret: string;
  error: string;
  errorExtra: string;
}

/** A theme the user can pick: one of the built-in parrots, or their own colours. */
export type ThemeChoice = ThemeId | 'custom';

export interface Theme {
  id: ThemeChoice;
  name: string;
  light: boolean;
  tokens: ThemeTokens;
}

/** A built-in theme (the custom theme is not in this list). */
export interface BuiltinTheme extends Theme {
  id: ThemeId;
}

export const THEMES: readonly BuiltinTheme[] = [
  {
    id: 'kea', name: 'Kea', light: false,
    tokens: { bg: '#1d2119', surface: '#272c22', text: '#e4e3d3', sub: '#6f7562', main: '#9db35f', caret: '#f0782f', error: '#e0525a', errorExtra: '#8f3a3f' },
  },
  {
    id: 'kakapo', name: 'Kākāpō', light: false,
    tokens: { bg: '#142019', surface: '#1c2b22', text: '#d8e8c8', sub: '#5d7a63', main: '#b9d36c', caret: '#e9d86a', error: '#e8746a', errorExtra: '#9c4942' },
  },
  {
    id: 'macaw', name: 'Macaw', light: false,
    tokens: { bg: '#0f1f3a', surface: '#172a4c', text: '#f2ead8', sub: '#5b6f96', main: '#ffc93c', caret: '#ff3b3b', error: '#ff6b6b', errorExtra: '#a33a3a' },
  },
  {
    id: 'cockatoo', name: 'Cockatoo', light: true,
    tokens: { bg: '#e6e9ec', surface: '#d8dde2', text: '#2a3138', sub: '#8b949d', main: '#c99a00', caret: '#2a3138', error: '#c4303a', errorExtra: '#e08a90' },
  },
  {
    id: 'galah', name: 'Galah', light: false,
    tokens: { bg: '#3a3439', surface: '#463f45', text: '#f5dce4', sub: '#9a8b93', main: '#ef8fae', caret: '#f6b8cc', error: '#ff5f6d', errorExtra: '#a8434c' },
  },
  {
    id: 'lorikeet', name: 'Lorikeet', light: false,
    tokens: { bg: '#1e1640', surface: '#2a2056', text: '#ece6ff', sub: '#7a6fb0', main: '#a6e22e', caret: '#ff8c2b', error: '#ff4d6d', errorExtra: '#a03a52' },
  },
  {
    id: 'budgie', name: 'Budgie', light: true,
    tokens: { bg: '#dfeef6', surface: '#cde3ef', text: '#1d3a4f', sub: '#7c97a9', main: '#2f8fd0', caret: '#e5b400', error: '#d1495b', errorExtra: '#e8909b' },
  },
  {
    id: 'cacatua-noir', name: 'Black Cockatoo', light: false,
    tokens: { bg: '#121212', surface: '#1d1b1b', text: '#e8e2e2', sub: '#625b5b', main: '#d33a3a', caret: '#f2c14e', error: '#ff6060', errorExtra: '#8a3030' },
  },
  {
    // Pure black and white for low vision. Text is 21:1 and sub text 10:1 on the background (see themes/contrast.test.ts).
    id: 'high-contrast', name: 'High contrast', light: false,
    tokens: { bg: '#000000', surface: '#1a1a1a', text: '#ffffff', sub: '#b3b3b3', main: '#ffe000', caret: '#00e5ff', error: '#ff7a7a', errorExtra: '#ff9ecf' },
  },
];

export const THEME_IDS: readonly ThemeId[] = THEMES.map((t) => t.id);
export const DEFAULT_THEME: ThemeId = 'kea';

export function getTheme(id: ThemeId): BuiltinTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

/**
 * The theme to show for a choice. 'custom' uses the saved colours; without them it falls back to the
 * default theme, so a stale choice never leaves the page unstyled.
 */
export function resolveTheme(choice: ThemeChoice, custom: ThemeTokens | null): Theme {
  if (choice === 'custom') {
    if (!custom) return getTheme(DEFAULT_THEME);
    return { id: 'custom', name: 'Custom', light: isLightColour(custom.bg), tokens: custom };
  }
  return getTheme(choice);
}

const TOKEN_VARS: Record<keyof ThemeTokens, string> = {
  bg: '--bg',
  surface: '--surface',
  text: '--text',
  sub: '--sub',
  main: '--main',
  caret: '--caret',
  error: '--error',
  errorExtra: '--error-extra',
};

/** Sets the colour tokens, data-theme, colour-scheme and theme-color on <html>. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const key of Object.keys(TOKEN_VARS) as (keyof ThemeTokens)[]) {
    root.style.setProperty(TOKEN_VARS[key], theme.tokens[key]);
  }
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.light ? 'light' : 'dark';

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = theme.tokens.bg;
}

export const FONTS: Record<FontId, { name: string; family: string }> = {
  spline: { name: 'Spline Sans Mono', family: "'Spline Sans Mono', ui-monospace, monospace" },
  redhat: { name: 'Red Hat Mono', family: "'Red Hat Mono', ui-monospace, monospace" },
  atkinson: { name: 'Atkinson Hyperlegible Mono', family: "'Atkinson Hyperlegible Mono', ui-monospace, monospace" },
  fragment: { name: 'Fragment Mono', family: "'Fragment Mono', ui-monospace, monospace" },
  sometype: { name: 'Sometype Mono', family: "'Sometype Mono', ui-monospace, monospace" },
  opendyslexic: { name: 'OpenDyslexic', family: "'OpenDyslexic', ui-monospace, monospace" },
};

/** The UI font families for the uiFont setting. The default is Familjen Grotesk (see index.css). */
export const UI_FONT_FAMILY = {
  default: "'Familjen Grotesk', system-ui, sans-serif",
  dyslexic: "'OpenDyslexic', system-ui, sans-serif",
} as const;

/** Sets the UI font family (--font-ui) for the uiFont setting. */
export function applyUiFont(font: 'default' | 'dyslexic'): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--font-ui', UI_FONT_FAMILY[font]);
}

/** Sets the root font size multiplier (--ui-scale). html's font size follows it, so every rem size scales. */
export function applyUiScale(scale: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

export const FONT_IDS: readonly FontId[] = Object.keys(FONTS) as FontId[];

/** Sets the test font family and size multiplier (--test-scale = 1.5 * fontSize). */
export function applyTestFont(font: FontId, fontSize: number): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--font-test', FONTS[font].family);
  root.style.setProperty('--test-scale', String(1.5 * fontSize));
}
