import { createHash, hkdfSync } from 'node:crypto';
import { decryptSecret, deriveBoxKey, encryptSecret, openWith, sealWith } from './secret-box';

const MATERIAL = 'unit-totp-key-material-with-enough-variety-1';

jest.mock('../config/env', () => ({
  getEnv: () => ({ TOTP_ENCRYPTION_KEY: 'unit-totp-key-material-with-enough-variety-1' }),
}));

const key = deriveBoxKey('unit-test-key-material-that-is-long-enough');

describe('secret box (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const sealed = sealWith(key, 'JBSWY3DPEHPK3PXP');
    expect(openWith(key, sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('stores v2:<iv>:<tag>:<ciphertext>, with a 12-byte IV and a 16-byte tag', () => {
    const parts = sealWith(key, 'secret').split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v2');
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(12);
    expect(Buffer.from(parts[2], 'base64')).toHaveLength(16);
    expect(parts[3]).not.toContain('secret');
  });

  it('uses a fresh IV, so the same secret seals differently each time', () => {
    expect(sealWith(key, 'same')).not.toBe(sealWith(key, 'same'));
  });

  it('throws when the ciphertext is altered', () => {
    const [v, iv, tag, ct] = sealWith(key, 'JBSWY3DPEHPK3PXP').split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0x01;
    expect(() => openWith(key, [v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
  });

  it('throws when the tag is altered', () => {
    const [v, iv, tag, ct] = sealWith(key, 'JBSWY3DPEHPK3PXP').split(':');
    const flipped = Buffer.from(tag, 'base64');
    flipped[15] ^= 0x80;
    expect(() => openWith(key, [v, iv, flipped.toString('base64'), ct].join(':'))).toThrow();
  });

  it('throws under a different key', () => {
    const other = deriveBoxKey('another-key-material-that-is-also-long-enough');
    expect(() => openWith(other, sealWith(key, 'secret'))).toThrow();
  });

  it('rejects an unknown version or a malformed value', () => {
    const sealed = sealWith(key, 'secret');
    expect(() => openWith(key, sealed.replace(/^v2:/, 'v3:'))).toThrow('Unrecognised encrypted value');
    expect(() => openWith(key, 'v2:only-two-parts')).toThrow('Unrecognised encrypted value');
  });
});

describe('secret box key versions (v1 to v2)', () => {
  it('v2 derives its key with HKDF-SHA256 (salt parrotype, info totp-secret); v1 is the plain sha256', () => {
    expect(deriveBoxKey(MATERIAL, 'v2').equals(Buffer.from(hkdfSync('sha256', MATERIAL, 'parrotype', 'totp-secret', 32)))).toBe(true);
    expect(deriveBoxKey(MATERIAL, 'v1').equals(createHash('sha256').update(MATERIAL, 'utf8').digest())).toBe(true);
    expect(deriveBoxKey(MATERIAL, 'v1').equals(deriveBoxKey(MATERIAL, 'v2'))).toBe(false);
  });

  it('decrypts a v1 secret written before this change', () => {
    const legacy = sealWith(deriveBoxKey(MATERIAL, 'v1'), 'JBSWY3DPEHPK3PXP', 'v1');
    expect(legacy.startsWith('v1:')).toBe(true);
    expect(decryptSecret(legacy)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('encrypts new secrets as v2, which decrypts, and which the v1 key cannot open', () => {
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(sealed.startsWith('v2:')).toBe(true);
    expect(decryptSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => openWith(deriveBoxKey(MATERIAL, 'v1'), sealed)).toThrow();
  });

  it('refuses a tampered v1 secret', () => {
    const [v, iv, tag, ct] = sealWith(deriveBoxKey(MATERIAL, 'v1'), 'JBSWY3DPEHPK3PXP', 'v1').split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0x01;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
  });
});
