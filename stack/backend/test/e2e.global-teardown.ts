import { existsSync, rmSync } from 'node:fs';
import { E2E_DB_FILE } from './e2e.env';

export default function globalTeardown(): void {
  for (const f of [E2E_DB_FILE, `${E2E_DB_FILE}-journal`]) {
    if (existsSync(f)) rmSync(f);
  }
}
