import { base32Decode, base32Encode, generateSecret, hotp, otpauthUrl, stepAt, totpAt, verifyTotp } from './totp';

/** RFC 6238 Appendix B: the SHA-1 seed is the 20-byte ASCII string below. */
const RFC_SEED = Buffer.from('12345678901234567890', 'ascii');
const RFC_SECRET = base32Encode(RFC_SEED);

/** [unix time, the 8-digit RFC value]. The 6-digit codes are the last six digits of each. */
const RFC_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('base32', () => {
  it('encodes the RFC seed to its known base32 form', () => {
    expect(RFC_SECRET).toBe('gezdgnbvgy3tqojqgezdgnbvgy3tqojq');
  });

  it('round-trips arbitrary bytes, and decodes case-insensitively with spaces and padding ignored', () => {
    for (let len = 0; len < 40; len++) {
      const bytes = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff));
      expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    }
    expect(base32Decode('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ').equals(RFC_SEED)).toBe(true);
    expect(base32Decode(`${RFC_SECRET.slice(0, 16)}====`).equals(RFC_SEED.subarray(0, 10))).toBe(true);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('abc1')).toThrow('Invalid base32 character');
  });

  it('generates a 32-character secret from 20 random bytes, different each time', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[a-z2-7]{32}$/);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });
});

describe('HOTP / TOTP (RFC 6238, SHA-1)', () => {
  it.each(RFC_VECTORS)('the 8-digit HOTP for time %i is %s', (time, eightDigits) => {
    const step = stepAt(time);
    expect(hotp(RFC_SEED, step, 8)).toBe(eightDigits);
  });

  it.each(RFC_VECTORS)('the 6-digit code for time %i is the last six digits of the RFC value', (time, eightDigits) => {
    expect(totpAt(RFC_SECRET, time)).toBe(eightDigits.slice(-6));
  });

  it('uses 30-second steps', () => {
    expect(stepAt(59)).toBe(1);
    expect(stepAt(60)).toBe(2);
    expect(totpAt(RFC_SECRET, 30)).toBe(totpAt(RFC_SECRET, 59));
  });
});

describe('verifyTotp', () => {
  const now = 1111111111;

  it('accepts the current step and returns its counter', () => {
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now), now)).toBe(stepAt(now));
  });

  it('accepts one step either side of now (window 1), and nothing further', () => {
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 30), now)).toBe(stepAt(now) - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 30), now)).toBe(stepAt(now) + 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 60), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 60), now)).toBeNull();
  });

  it('rejects anything that is not six digits', () => {
    const code = totpAt(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code.slice(1), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, `${code}0`, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBeNull();
  });

  it('returns null for a wrong code of the right shape', () => {
    const code = totpAt(RFC_SECRET, now);
    const wrong = code === '000000' ? '000001' : '000000';
    expect(verifyTotp(RFC_SECRET, wrong, now)).toBeNull();
  });
});

describe('otpauthUrl', () => {
  it('builds an authenticator URL with the issuer, label and SHA-1 / 6 digits / 30 seconds', () => {
    const url = new URL(otpauthUrl(RFC_SECRET, 'typist_1'));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/ParroType:typist_1');
    expect(url.searchParams.get('secret')).toBe(RFC_SECRET);
    expect(url.searchParams.get('issuer')).toBe('ParroType');
    expect(url.searchParams.get('algorithm')).toBe('SHA1');
    expect(url.searchParams.get('digits')).toBe('6');
    expect(url.searchParams.get('period')).toBe('30');
  });
});
