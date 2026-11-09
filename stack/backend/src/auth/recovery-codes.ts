import { createHash, createHmac, randomBytes } from 'node:crypto';
import { getEnv } from '../config/env';
import { hkdfKey } from './secret-box';

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

/** The HMAC key for recovery codes: HKDF of TOTP_ENCRYPTION_KEY, bound to this purpose only. */
export function recoveryHashKey(material: string = getEnv().TOTP_ENCRYPTION_KEY): Buffer {
  return hkdfKey(material, 'recovery-codes');
}

/**
 * HMAC-SHA256 hex of the normalised code. This is what new codes are stored as. Without the key, a
 * database dump does not let anyone test a guess at a code, since a code is only 40 bits.
 */
export function hashRecoveryCode(code: string, key: Buffer = recoveryHashKey()): string {
  const normalized = normalizeRecoveryCode(code) ?? code;
  return createHmac('sha256', key).update(normalized, 'utf8').digest('hex');
}

/** Plain sha256 hex of the normalised code: how codes were stored before the HMAC. Only for matching old rows. */
export function legacyHashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code) ?? code;
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** The stored forms a typed code can match: the HMAC for new codes and the sha256 for codes made earlier. */
export function recoveryCodeLookupHashes(code: string): string[] {
  return [hashRecoveryCode(code), legacyHashRecoveryCode(code)];
}

export function isRecoveryCodeFormat(code: string): boolean {
  return CODE_FORMAT.test(code);
}
