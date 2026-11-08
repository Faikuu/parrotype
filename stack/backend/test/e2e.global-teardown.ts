import { existsSync, rmSync } from 'node:fs';
import { E2E_DB_FILE } from './e2e.env';

export default function globalTeardown(): void {
  // Only the SQLite file is local. PostgreSQL and MySQL databases are left in place for inspection.
  for (const f of [E2E_DB_FILE, `${E2E_DB_FILE}-journal`]) {
    if (existsSync(f)) rmSync(f);
  }
}
