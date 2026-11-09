import { existsSync, rmSync } from 'node:fs';
import { sqliteFileOf } from './e2e.env';

export default function globalTeardown(): void {
  // Only the SQLite file is local. PostgreSQL and MySQL databases are left in place for inspection.
  const file = sqliteFileOf(process.env.DATABASE_URL) ?? '';
  for (const f of [file, `${file}-journal`]) {
    if (file && existsSync(f)) rmSync(f);
  }
}
