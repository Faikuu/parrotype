import type { ThemeTokens } from './themes';

/** Prefix of a shared theme code. The number is the code format version. */
export const THEME_CODE_PREFIX = 'pt1.';
/** Longest code accepted on import. A full theme is well under 200 characters. */
const MAX_CODE_LENGTH = 1000;

export const TOKEN_KEYS = ['bg', 'surface', 'text', 'sub', 'main', 'caret', 'error', 'errorExtra'] as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** The eight colour tokens as a lowercase object, or null when any field is missing or not `#rrggbb`. */
export function normaliseTokens(input: unknown): ThemeTokens | null {
  if (!input || typeof input !== 'object') return null;
  const src = input as Record<string, unknown>;
  const out = {} as Record<string, string>;
  for (const key of TOKEN_KEYS) {
    const value = src[key];
    if (!isHexColour(value)) return null;
    out[key] = value.toLowerCase();
  }
  return out as unknown as ThemeTokens;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** `pt1.` + base64url(JSON of the eight tokens, in a fixed key order). */
export function encodeThemeCode(tokens: ThemeTokens): string {
  const ordered: Record<string, string> = {};
  for (const key of TOKEN_KEYS) ordered[key] = tokens[key].toLowerCase();
  const bytes = new TextEncoder().encode(JSON.stringify(ordered));
  return THEME_CODE_PREFIX + toBase64Url(bytes);
}

/** Reads a theme code back. Returns null for anything that is not a valid code. */
export function decodeThemeCode(code: string): ThemeTokens | null {
  const text = code.trim();
  if (!text.startsWith(THEME_CODE_PREFIX) || text.length > MAX_CODE_LENGTH) return null;
  try {
    const bytes = fromBase64Url(text.slice(THEME_CODE_PREFIX.length));
    if (!bytes) return null;
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return normaliseTokens(JSON.parse(json));
  } catch {
    return null;
  }
}
