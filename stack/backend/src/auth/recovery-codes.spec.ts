import { createHash, hkdfSync } from 'node:crypto';
import {
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  isRecoveryCodeFormat,
  legacyHashRecoveryCode,
  normalizeRecoveryCode,
  recoveryCodeLookupHashes,
  recoveryHashKey,
  RECOVERY_CODE_COUNT,
} from './recovery-codes';

const MATERIAL = 'unit-totp-key-material-with-enough-variety-1';

jest.mock('../config/env', () => ({
  getEnv: () => ({ TOTP_ENCRYPTION_KEY: 'unit-totp-key-material-with-enough-variety-1' }),
}));

describe('recovery codes', () => {
  it('makes ten codes of the form xxxx-xxxx in the lowercase base32 alphabet', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(RECOVERY_CODE_COUNT).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
      expect(isRecoveryCodeFormat(code)).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('covers the whole alphabet over many draws (no code is stuck on a subset)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const c of generateRecoveryCode().replace('-', '')) seen.add(c);
    expect(seen.size).toBe(32);
  });

  it('normalises typed input: case, spaces and dashes do not matter', () => {
    expect(normalizeRecoveryCode('ABCD-2345')).toBe('abcd-2345');
    expect(normalizeRecoveryCode(' abcd 2345 ')).toBe('abcd-2345');
    expect(normalizeRecoveryCode('abcd2345')).toBe('abcd-2345');
  });

  it('returns null for input that cannot be a recovery code (so it is tried as a TOTP code)', () => {
    expect(normalizeRecoveryCode('123456')).toBeNull();
    expect(normalizeRecoveryCode('abc-def')).toBeNull();
    expect(normalizeRecoveryCode('abcd-234!')).toBeNull();
    expect(normalizeRecoveryCode('abcd-2349')).toBeNull(); // 8 and 9 are outside base32
  });

  it('stores an HMAC-SHA256 keyed by an HKDF of TOTP_ENCRYPTION_KEY, so every spelling of a code hashes the same', () => {
    const key = Buffer.from(hkdfSync('sha256', MATERIAL, 'parrotype', 'recovery-codes', 32));
    expect(recoveryHashKey(MATERIAL).equals(key)).toBe(true);
    const expected = hashRecoveryCode('abcd-2345', key);
    expect(hashRecoveryCode('abcd-2345')).toBe(expected);
    expect(hashRecoveryCode('ABCD 2345')).toBe(expected);
    expect(hashRecoveryCode('abcd2345')).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is not the plain sha256 of the code, so a dump of the table cannot be checked offline without the key', () => {
    const plain = createHash('sha256').update('abcd-2345', 'utf8').digest('hex');
    expect(hashRecoveryCode('abcd-2345')).not.toBe(plain);
    expect(hashRecoveryCode('abcd-2345', Buffer.alloc(32, 7))).not.toBe(hashRecoveryCode('abcd-2345'));
  });

  it('keeps the plain sha256 under legacyHashRecoveryCode, for codes stored before the HMAC', () => {
    const plain = createHash('sha256').update('abcd-2345', 'utf8').digest('hex');
    expect(legacyHashRecoveryCode('ABCD 2345')).toBe(plain);
  });

  it('looks a typed code up under both forms, the HMAC first', () => {
    const hashes = recoveryCodeLookupHashes('abcd2345');
    expect(hashes).toEqual([hashRecoveryCode('abcd-2345'), legacyHashRecoveryCode('abcd-2345')]);
  });
});
