import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JWT_SAMPLE_MESSAGE, jwtSecretProblem, loadEnv, SAMPLE_JWT_SECRET } from './env';

const base = { DATABASE_PROVIDER: 'sqlite', DATABASE_URL: 'file:../dev.db' };
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
