import { deriveBoxKey, openWith, sealWith } from './secret-box';

const key = deriveBoxKey('unit-test-key-material-that-is-long-enough');

describe('secret box (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const sealed = sealWith(key, 'JBSWY3DPEHPK3PXP');
    expect(openWith(key, sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('stores v1:<iv>:<tag>:<ciphertext>, with a 12-byte IV and a 16-byte tag', () => {
    const parts = sealWith(key, 'secret').split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
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
    expect(() => openWith(key, sealed.replace(/^v1:/, 'v2:'))).toThrow('Unrecognised encrypted value');
    expect(() => openWith(key, 'v1:only-two-parts')).toThrow('Unrecognised encrypted value');
  });
});
