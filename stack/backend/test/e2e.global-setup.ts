import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { applyE2eEnv, E2E_DB_FILE } from './e2e.env';

const backend = join(__dirname, '..');

/** Runs scripts/prisma.mjs with the e2e environment. Errors carry Prisma's own output. */
function runPrisma(...args: string[]): void {
  try {
    execFileSync(process.execPath, [join(backend, 'scripts', 'prisma.mjs'), ...args], {
      cwd: backend,
      env: process.env,
      stdio: 'pipe',
    });
  } catch (err) {
    const out = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`prisma ${args.join(' ')} failed:\n${String(out.stderr ?? '')}${String(out.stdout ?? '')}`);
  }
}

export default function globalSetup(): void {
  applyE2eEnv();
  // The generated client is shared by the whole project, so generate it for the engine under test.
  runPrisma('generate');

  if (process.env.DATABASE_PROVIDER === 'sqlite') {
    for (const f of [E2E_DB_FILE, `${E2E_DB_FILE}-journal`]) {
      if (existsSync(f)) rmSync(f);
    }
    runPrisma('migrate', 'deploy');
  } else {
    // Drops and recreates the database, then applies the provider's migrations. The e2e database
    // must be one that can be wiped (its own database, not the dev one).
    runPrisma('migrate', 'reset', '--force', '--skip-seed', '--skip-generate');
  }
}
