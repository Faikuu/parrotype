import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 4648 base32 alphabet, lowercase here (recovery codes and TOTP secrets are shown in it). */
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const BASE32_DECODE = new Map(Array.from(BASE32_ALPHABET).map((c, i) => [c, i]));
/** A TOTP secret is 20 random bytes (160 bits, the RFC 4226 minimum), which is 32 base32 characters. */
export const TOTP_SECRET_BYTES = 20;
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes base32 (either case, padding and spaces ignored). Throws on a character outside the alphabet. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toLowerCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const c of clean) {
    const v = BASE32_DECODE.get(c);
    if (v === undefined) throw new Error(`Invalid base32 character "${c}"`);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new TOTP secret, base32 encoded. */
export function generateSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

/** RFC 4226 HOTP: HMAC-SHA1 of the 8-byte counter, dynamically truncated to `digits` digits. */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  // Counters here stay far below 2^53, so the high 32 bits are the integer part divided by 2^32.
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  message.writeUInt32BE(counter % 0x100000000, 4);
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The TOTP step counter for a unix time in seconds (RFC 6238, 30-second steps). */
export function stepAt(unixSeconds: number): number {
  return Math.floor(unixSeconds / TOTP_STEP_SECONDS);
}

/** The 6-digit code for a base32 secret at a unix time in seconds. */
export function totpAt(secret: string, unixSeconds: number): string {
  return hotp(base32Decode(secret), stepAt(unixSeconds));
}

/**
 * Checks a code against the steps within `window` of `now` (unix seconds). Returns the matched step
 * counter, or null. The comparison is constant-time per candidate. Callers reject a step at or below
 * the last one they accepted (replay protection).
 */
export function verifyTotp(secret: string, code: string, now: number, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const current = stepAt(now);
  const given = Buffer.from(code);
  let matched: number | null = null;
  for (let d = -window; d <= window; d++) {
    const step = current + d;
    if (step < 0) continue;
    const candidate = Buffer.from(hotp(key, step));
    if (timingSafeEqual(candidate, given)) matched = step;
  }
  return matched;
}

/** The otpauth:// URL that authenticator apps and QR codes read. */
export function otpauthUrl(secret: string, account: string, issuer = 'ParroType'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
