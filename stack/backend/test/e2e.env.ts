import { join } from 'node:path';

/** Default e2e database: a SQLite file of its own, never dev.db. */
export const E2E_DB_FILE = join(__dirname, '..', 'prisma', 'test.db');

/**
 * Environment for the e2e run. Defaults to the SQLite test file. Set E2E_DATABASE_URL (and optionally
 * E2E_DATABASE_PROVIDER) to run against PostgreSQL or MySQL/MariaDB instead. Use a database that is
 * safe to wipe: the setup resets it before the run.
 */
export function applyE2eEnv(): void {
  const url = process.env.E2E_DATABASE_URL || `file:${E2E_DB_FILE}`;
  process.env.DATABASE_PROVIDER = process.env.E2E_DATABASE_PROVIDER || providerFromUrl(url);
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'e2e-only-secret-that-is-at-least-32-chars-long';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.COOKIE_SECURE = 'false';
}

function providerFromUrl(url: string): string {
  if (/^postgres(ql)?:\/\//.test(url)) return 'postgresql';
  if (url.startsWith('mysql://')) return 'mysql';
  return 'sqlite';
}
