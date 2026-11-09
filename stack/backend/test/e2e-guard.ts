import { basename, resolve } from 'node:path';

/**
 * The e2e run drops tables before it migrates. This guard decides whether that reset may run,
 * and is called before anything else in the global setup, so a refusal touches nothing.
 */

export interface E2eGuardPaths {
  /** The default SQLite file (prisma/test.db). The reset is allowed here without E2E_ALLOW_RESET. */
  defaultSqliteFile: string;
  /** Folder that relative SQLite paths resolve from (prisma/sqlite, the schema folder). */
  sqliteSchemaDir: string;
}

/** Database names the reset may wipe: parrotype_e2e, parrotype_e2e_<suffix>, or <anything>_test. */
export const E2E_DB_NAME_PATTERNS: readonly RegExp[] = [/^parrotype_e2e(_\w+)?$/, /^\w*_test$/];
/** Hosts the reset may connect to. Remote databases are never wiped. */
export const E2E_LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '::1'];
/** SQLite files other than the default one must end with one of these. */
const SQLITE_FILE_SUFFIX = /(test|e2e)\.db$/;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Returns why the reset must not run, or null when it may. Reads DATABASE_PROVIDER, DATABASE_URL
 * and E2E_ALLOW_RESET from `env`.
 *
 * Allowed when:
 * - the provider is sqlite and the file is the default prisma/test.db, or
 * - E2E_ALLOW_RESET=1 and, for sqlite, the file name ends with "test.db" or "e2e.db", or, for
 *   PostgreSQL/MySQL, the database name matches E2E_DB_NAME_PATTERNS and the host is local.
 */
export function e2eResetProblem(env: NodeJS.ProcessEnv, paths: E2eGuardPaths): string | null {
  const provider = env.DATABASE_PROVIDER;
  const url = env.DATABASE_URL;
  if (!url) return 'DATABASE_URL is not set';
  const allowed = env.E2E_ALLOW_RESET === '1';

  if (provider === 'sqlite') {
    if (!url.startsWith('file:')) return 'DATABASE_URL must be a file: URL for SQLite';
    const file = resolve(paths.sqliteSchemaDir, url.slice('file:'.length).split('?')[0]);
    if (file === resolve(paths.defaultSqliteFile)) return null;
    if (!allowed) {
      return `${file} is not the default test database. Set E2E_ALLOW_RESET=1 to reset another SQLite file`;
    }
    if (!SQLITE_FILE_SUFFIX.test(basename(file))) {
      return `the SQLite file name must end with "test.db" or "e2e.db" (got "${basename(file)}")`;
    }
    return null;
  }

  if (provider !== 'postgresql' && provider !== 'mysql') {
    return `unknown DATABASE_PROVIDER "${provider ?? ''}"`;
  }
  if (!allowed) {
    return `the reset drops tables in this ${provider} database. Set E2E_ALLOW_RESET=1 to allow it`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'DATABASE_URL is not a valid URL';
  }
  const protocolMatches = provider === 'postgresql'
    ? /^postgres(ql)?:$/.test(parsed.protocol)
    : parsed.protocol === 'mysql:';
  if (!protocolMatches) return `DATABASE_URL does not match DATABASE_PROVIDER=${provider}`;

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!E2E_LOCAL_HOSTS.includes(host)) {
    return `host "${host}" is not local (expected localhost, 127.0.0.1 or ::1)`;
  }

  const dbName = safeDecode(parsed.pathname.replace(/^\//, ''));
  if (!E2E_DB_NAME_PATTERNS.some((p) => p.test(dbName))) {
    return `database "${dbName}" does not look like a test database (expected parrotype_e2e, parrotype_e2e_<suffix> or <name>_test)`;
  }
  return null;
}

/** Throws a readable error when the reset must not run. Call it before touching the database. */
export function assertE2eResetAllowed(env: NodeJS.ProcessEnv, paths: E2eGuardPaths): void {
  const problem = e2eResetProblem(env, paths);
  if (problem) throw new Error(`Refusing to reset the e2e database: ${problem}.`);
}
