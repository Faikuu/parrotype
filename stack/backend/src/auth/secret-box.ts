import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getEnv } from '../config/env';

/**
 * AES-256-GCM for secrets stored at rest (TOTP secrets). The key is sha256(TOTP_ENCRYPTION_KEY).
 * The stored form is `v1:<iv b64>:<tag b64>:<ciphertext b64>`, with a fresh random 12-byte IV per value.
 */
const VERSION = 'v1';
const IV_BYTES = 12;

export function deriveBoxKey(material: string): Buffer {
  return createHash('sha256').update(material, 'utf8').digest();
}

export function sealWith(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Throws when the value is malformed or was altered (the GCM tag does not verify). */
export function openWith(key: Buffer, sealed: string): string {
  const parts = sealed.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unrecognised encrypted value');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_BYTES || tag.length !== 16) throw new Error('Malformed encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Encrypts with the configured TOTP_ENCRYPTION_KEY. */
export function encryptSecret(plaintext: string): string {
  return sealWith(deriveBoxKey(getEnv().TOTP_ENCRYPTION_KEY), plaintext);
}

/** Decrypts with the configured TOTP_ENCRYPTION_KEY. Throws if the value was tampered with. */
export function decryptSecret(sealed: string): string {
  return openWith(deriveBoxKey(getEnv().TOTP_ENCRYPTION_KEY), sealed);
}
