import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { applyE2eEnv, E2E_DB_FILE } from './e2e.env';

export default function globalSetup(): void {
  applyE2eEnv();
  for (const f of [E2E_DB_FILE, `${E2E_DB_FILE}-journal`]) {
    if (existsSync(f)) rmSync(f);
  }
  const backend = join(__dirname, '..');
  // Create the test schema from the committed migrations.
  execFileSync(join(backend, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: backend,
    env: process.env,
    stdio: 'pipe',
  });
}
