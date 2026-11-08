import { join } from 'node:path';

/** Environment for the e2e run. Uses its own SQLite file, never dev.db. */
export const E2E_DB_FILE = join(__dirname, '..', 'prisma', 'test.db');

export function applyE2eEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = `file:${E2E_DB_FILE}`;
  process.env.JWT_SECRET = 'e2e-only-secret-that-is-at-least-32-chars-long';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.COOKIE_SECURE = 'false';
}
