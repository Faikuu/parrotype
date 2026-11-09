import { join, resolve } from 'node:path';

/** Default e2e database: a SQLite file of its own, never dev.db. */
export const E2E_DB_FILE = join(__dirname, '..', 'prisma', 'test.db');

/**
 * The SQLite file a DATABASE_URL names (relative paths resolve from prisma/sqlite, as Prisma does), or null
 * for PostgreSQL and MySQL. The setup and teardown delete only this file, so a custom test file is left alone.
 */
export function sqliteFileOf(url: string | undefined): string | null {
  if (!url?.startsWith('file:')) return null;
  return resolve(join(__dirname, '..', 'prisma', 'sqlite'), url.slice('file:'.length).split('?')[0]);
}

/**
 * Environment for the e2e run. Defaults to the SQLite test file. Set E2E_DATABASE_URL (and optionally
 * E2E_DATABASE_PROVIDER) to run against PostgreSQL or MySQL/MariaDB instead. The setup resets that
 * database before the run, but only if test/e2e-guard.ts allows it (E2E_ALLOW_RESET=1 and a
 * test-named database on a local host).
 */
export function applyE2eEnv(): void {
  const url = process.env.E2E_DATABASE_URL || `file:${E2E_DB_FILE}`;
  process.env.DATABASE_PROVIDER = process.env.E2E_DATABASE_PROVIDER || providerFromUrl(url);
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'e2e-only-secret-that-is-at-least-32-chars-long';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.COOKIE_SECURE = 'false';
  // Account emails go to the in-memory outbox (MailService), never to SMTP.
  process.env.MAIL_TRANSPORT = 'console';
  process.env.APP_URL = 'http://localhost:5173';
  process.env.TOTP_ENCRYPTION_KEY = 'e2e-only-totp-key-that-is-long-enough-and-differs';
}

function providerFromUrl(url: string): string {
  if (/^postgres(ql)?:\/\//.test(url)) return 'postgresql';
  if (url.startsWith('mysql://')) return 'mysql';
  return 'sqlite';
}
