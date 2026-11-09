import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { applyE2eEnv, E2E_DB_FILE } from './e2e.env';
import { assertE2eResetAllowed } from './e2e-guard';

const backend = join(__dirname, '..');

/** Runs scripts/prisma.mjs with the e2e environment. Errors carry Prisma's own output. */
function runPrisma(args: string[], input?: string): void {
  try {
    execFileSync(process.execPath, [join(backend, 'scripts', 'prisma.mjs'), ...args], {
      cwd: backend,
      env: process.env,
      stdio: 'pipe',
      input,
    });
  } catch (err) {
    const out = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`prisma ${args.join(' ')} failed:\n${String(out.stderr ?? '')}${String(out.stdout ?? '')}`);
  }
}

/**
 * Drops the app's tables so the migrations can apply to a clean database. Dropping tables (rather
 * than `prisma migrate reset`) keeps the reset to the tables this schema owns.
 */
function dropAppTables(provider: string): void {
  // Children (Result, Follow, Report, UserGroup, GroupPermission) are listed before their parents so the drop order satisfies the foreign keys.
  const sql = provider === 'postgresql'
    ? 'DROP TABLE IF EXISTS "Follow", "Report", "Result", "UserGroup", "GroupPermission", "PermissionGroup", "AdminAction", "Quote", "User", "_prisma_migrations" CASCADE;'
    : 'DROP TABLE IF EXISTS `Follow`, `Report`, `Result`, `UserGroup`, `GroupPermission`, `PermissionGroup`, `AdminAction`, `Quote`, `User`, `_prisma_migrations`;';
  runPrisma(['db', 'execute', '--stdin'], sql);
}

export default function globalSetup(): void {
  applyE2eEnv();
  // First, before the client is generated or any table is touched.
  assertE2eResetAllowed(process.env, {
    defaultSqliteFile: E2E_DB_FILE,
    sqliteSchemaDir: join(backend, 'prisma', 'sqlite'),
  });
  // The generated client is shared by the whole project, so generate it for the engine under test.
  runPrisma(['generate']);

  if (process.env.DATABASE_PROVIDER === 'sqlite') {
    for (const f of [E2E_DB_FILE, `${E2E_DB_FILE}-journal`]) {
      if (existsSync(f)) rmSync(f);
    }
    runPrisma(['migrate', 'deploy']);
    return;
  }

  dropAppTables(process.env.DATABASE_PROVIDER ?? '');
  runPrisma(['migrate', 'deploy']);
}
