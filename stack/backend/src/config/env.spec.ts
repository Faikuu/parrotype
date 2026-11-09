import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MAIL_FROM,
  JWT_SAMPLE_MESSAGE,
  jwtSecretProblem,
  loadEnv,
  SAMPLE_JWT_SECRET,
  TOTP_SAMPLE_MESSAGE,
  totpKeyProblem,
} from './env';

const TOTP_KEY = 'totp-only-key-for-tests-that-is-long-enough-1';
const base = {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: 'file:../dev.db',
  TOTP_ENCRYPTION_KEY: TOTP_KEY,
};
const withSecret = (JWT_SECRET: string) => ({ ...base, JWT_SECRET });

describe('JWT_SECRET rules', () => {
  it('matches the placeholder in .env.sample exactly', () => {
    const sample = readFileSync(join(__dirname, '..', '..', '.env.sample'), 'utf8');
    expect(sample).toContain(`JWT_SECRET=${SAMPLE_JWT_SECRET}\n`);
  });

  it('refuses the sample value, with the generate-a-secret hint', () => {
    expect(() => loadEnv(withSecret(SAMPLE_JWT_SECRET))).toThrow(
      'JWT_SECRET is still the sample value. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
    expect(jwtSecretProblem(SAMPLE_JWT_SECRET)).toBe(JWT_SAMPLE_MESSAGE);
  });

  it('refuses any value containing "change-me", whatever the case', () => {
    for (const secret of [
      'Change-Me-this-is-a-long-enough-secret-value-123',
      'prefix CHANGE-ME suffix with plenty of other characters',
      'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx change-me',
    ]) {
      expect(jwtSecretProblem(secret)).toBe(JWT_SAMPLE_MESSAGE);
    }
  });

  it('requires at least 10 distinct characters', () => {
    // 32 characters long, but only 4 distinct ones.
    const repetitive = 'abcd'.repeat(8);
    expect(repetitive).toHaveLength(32);
    expect(() => loadEnv(withSecret(repetitive))).toThrow(
      'JWT_SECRET must have at least 10 distinct characters',
    );
    // Exactly 10 distinct characters is accepted.
    expect(jwtSecretProblem('0123456789'.repeat(4))).toBeNull();
    expect(jwtSecretProblem('012345678'.repeat(4))).toMatch(/at least 10 distinct/);
  });

  it('still requires 32 characters', () => {
    expect(() => loadEnv(withSecret('short-but-varied-1234'))).toThrow('JWT_SECRET must be at least 32 characters');
  });

  it('accepts a secret made the way scripts/init-env.mjs makes one', () => {
    for (let i = 0; i < 20; i++) {
      const secret = randomBytes(48).toString('base64url');
      expect(jwtSecretProblem(secret)).toBeNull();
      expect(loadEnv(withSecret(secret)).JWT_SECRET).toBe(secret);
    }
  });

  it('accepts the e2e secret', () => {
    expect(jwtSecretProblem('e2e-only-secret-that-is-at-least-32-chars-long')).toBeNull();
  });
});

describe('TOTP_ENCRYPTION_KEY rules', () => {
  const fresh = (key: string | undefined) => {
    const source: Record<string, string> = { ...base, JWT_SECRET: 'e2e-only-secret-that-is-at-least-32-chars-long' };
    if (key === undefined) delete source.TOTP_ENCRYPTION_KEY;
    else source.TOTP_ENCRYPTION_KEY = key;
    return source;
  };

  it('is required', () => {
    expect(() => loadEnv(fresh(undefined))).toThrow('TOTP_ENCRYPTION_KEY is required');
  });

  it('must be at least 32 characters', () => {
    expect(() => loadEnv(fresh('short-but-varied-1234'))).toThrow('TOTP_ENCRYPTION_KEY must be at least 32 characters');
  });

  it('refuses the sample and any "change-me" value', () => {
    expect(() => loadEnv(fresh(SAMPLE_JWT_SECRET))).toThrow(TOTP_SAMPLE_MESSAGE);
    expect(totpKeyProblem('my-change-me-key-that-is-long-enough-abcdef')).toBe(TOTP_SAMPLE_MESSAGE);
  });

  it('must differ from JWT_SECRET', () => {
    const same = 'e2e-only-secret-that-is-at-least-32-chars-long';
    expect(() => loadEnv({ ...base, JWT_SECRET: same, TOTP_ENCRYPTION_KEY: same })).toThrow(
      'TOTP_ENCRYPTION_KEY must differ from JWT_SECRET',
    );
  });

  it('accepts a generated key', () => {
    const key = randomBytes(48).toString('base64url');
    expect(loadEnv(fresh(key)).TOTP_ENCRYPTION_KEY).toBe(key);
  });
});

describe('mail and APP_URL settings', () => {
  const secure = { ...base, JWT_SECRET: 'e2e-only-secret-that-is-at-least-32-chars-long' };

  it('defaults to the console transport, the default sender and the local web app', () => {
    const env = loadEnv(secure);
    expect(env).toMatchObject({
      MAIL_TRANSPORT: 'console',
      SMTP_URL: null,
      MAIL_FROM: DEFAULT_MAIL_FROM,
      APP_URL: 'http://localhost:5173',
    });
  });

  it('requires SMTP_URL with the smtp transport, and checks its scheme', () => {
    expect(() => loadEnv({ ...secure, MAIL_TRANSPORT: 'smtp' })).toThrow('SMTP_URL is required when MAIL_TRANSPORT=smtp');
    expect(() => loadEnv({ ...secure, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'http://mail.example.com' })).toThrow(
      'SMTP_URL must be a smtp:// or smtps:// URL',
    );
    expect(loadEnv({ ...secure, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtps://u:p@mail.example.com:465' }).SMTP_URL).toBe(
      'smtps://u:p@mail.example.com:465',
    );
  });

  it('rejects an unknown transport', () => {
    expect(() => loadEnv({ ...secure, MAIL_TRANSPORT: 'pigeon' })).toThrow('MAIL_TRANSPORT');
  });

  it('keeps SMTP_URL out of the console transport', () => {
    expect(loadEnv({ ...secure, SMTP_URL: 'smtp://mail.example.com' }).SMTP_URL).toBeNull();
  });

  it('validates APP_URL as http(s) and drops a trailing slash', () => {
    expect(() => loadEnv({ ...secure, APP_URL: 'not a url' })).toThrow('APP_URL must be an http or https URL');
    expect(() => loadEnv({ ...secure, APP_URL: 'ftp://example.com' })).toThrow('APP_URL must be an http or https URL');
    expect(loadEnv({ ...secure, APP_URL: 'https://parrotype.example.com/' }).APP_URL).toBe('https://parrotype.example.com');
  });

  it('refuses a MAIL_FROM with a line break (header injection)', () => {
    expect(() => loadEnv({ ...secure, MAIL_FROM: 'a@example.com\r\nBcc: x@example.com' })).toThrow('MAIL_FROM must be a single line');
  });
});
