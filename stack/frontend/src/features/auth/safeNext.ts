const FALLBACK = '/account';

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * Returns `raw` when it is a same-origin path, otherwise the fallback.
 * Blocks protocol-relative URLs (`//host`), backslash tricks (`/\host`),
 * absolute URLs and control characters, to prevent open redirects.
 */
export function safeNext(raw: string | null | undefined, fallback: string = FALLBACK): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (hasControlChar(raw)) return fallback;
  try {
    const base = 'http://local.invalid';
    if (new URL(raw, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return raw;
}
