import { createHash, randomBytes } from 'node:crypto';

/** Ten codes per set. Each is `xxxx-xxxx` from the lowercase base32 alphabet (32 symbols, so no modulo bias). */
export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const CODE_FORMAT = /^[a-z2-7]{4}-[a-z2-7]{4}$/;

/** A new recovery code. Shown once; only its hash is stored. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(8);
  let raw = '';
  for (const byte of bytes) raw += ALPHABET[byte & 31];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode());
}

/**
 * Brings typed input to the stored form: lowercase, no spaces or dashes, then `xxxx-xxxx`. Returns
 * null when the input cannot be a recovery code, so the caller can treat it as a TOTP code instead.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.toLowerCase().replace(/[\s-]/g, '');
  if (!/^[a-z2-7]{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

/** sha256 hex of the normalised code. */
export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code) ?? code;
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function isRecoveryCodeFormat(code: string): boolean {
  return CODE_FORMAT.test(code);
}
