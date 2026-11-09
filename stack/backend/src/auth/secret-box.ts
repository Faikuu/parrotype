import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { getEnv } from '../config/env';

/**
 * AES-256-GCM for secrets stored at rest (TOTP secrets). The stored form is
 * `<version>:<iv b64>:<tag b64>:<ciphertext b64>`, with a fresh random 12-byte IV per value.
 *
 * Versions. Both are read; only v2 is written.
 * - v2: the key is HKDF-SHA256 of TOTP_ENCRYPTION_KEY (salt "parrotype", info "totp-secret").
 * - v1 (written before this version existed): the key is sha256 of TOTP_ENCRYPTION_KEY.
 */
export type BoxVersion = 'v1' | 'v2';
export const CURRENT_BOX_VERSION: BoxVersion = 'v2';
const VERSIONS: readonly BoxVersion[] = ['v1', 'v2'];
const IV_BYTES = 12;
/** The HKDF salt shared by every key this app derives from TOTP_ENCRYPTION_KEY. */
export const KDF_SALT = 'parrotype';

/** A 32-byte key from the key material, bound to a purpose (the HKDF info string). */
export function hkdfKey(material: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', material, KDF_SALT, info, 32));
}

/** The AES key for a version. */
export function deriveBoxKey(material: string, version: BoxVersion = CURRENT_BOX_VERSION): Buffer {
  if (version === 'v1') return createHash('sha256').update(material, 'utf8').digest();
  return hkdfKey(material, 'totp-secret');
}

/** The version a stored value was sealed with. Throws for anything else. */
export function boxVersionOf(sealed: string): BoxVersion {
  const version = sealed.split(':')[0];
  if (!VERSIONS.includes(version as BoxVersion)) throw new Error('Unrecognised encrypted value');
  return version as BoxVersion;
}

export function sealWith(key: Buffer, plaintext: string, version: BoxVersion = CURRENT_BOX_VERSION): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Throws when the value is malformed or was altered (the GCM tag does not verify). `key` must be the key for its version. */
export function openWith(key: Buffer, sealed: string): string {
  boxVersionOf(sealed);
  const parts = sealed.split(':');
  if (parts.length !== 4) throw new Error('Unrecognised encrypted value');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_BYTES || tag.length !== 16) throw new Error('Malformed encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Encrypts with the configured TOTP_ENCRYPTION_KEY, as v2. */
export function encryptSecret(plaintext: string): string {
  return sealWith(deriveBoxKey(getEnv().TOTP_ENCRYPTION_KEY), plaintext, CURRENT_BOX_VERSION);
}

/** Decrypts with the configured TOTP_ENCRYPTION_KEY, using the key of the value's own version (v1 or v2). */
export function decryptSecret(sealed: string): string {
  const material = getEnv().TOTP_ENCRYPTION_KEY;
  return openWith(deriveBoxKey(material, boxVersionOf(sealed)), sealed);
}
