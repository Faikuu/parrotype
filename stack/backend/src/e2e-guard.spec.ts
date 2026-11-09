import { join } from 'node:path';
import { assertE2eResetAllowed, e2eResetProblem, type E2eGuardPaths } from '../test/e2e-guard';

// The guard is pure: these paths only feed the SQLite checks.
const backend = join(__dirname, '..');
const paths: E2eGuardPaths = {
  defaultSqliteFile: join(backend, 'prisma', 'test.db'),
  sqliteSchemaDir: join(backend, 'prisma', 'sqlite'),
};
const pg = (url: string, extra: NodeJS.ProcessEnv = {}) => ({
  DATABASE_PROVIDER: 'postgresql',
  DATABASE_URL: url,
  E2E_ALLOW_RESET: '1',
  ...extra,
});

describe('e2e reset guard', () => {
  describe('SQLite', () => {
    it('allows the default prisma/test.db without E2E_ALLOW_RESET', () => {
      expect(e2eResetProblem({ DATABASE_PROVIDER: 'sqlite', DATABASE_URL: `file:${paths.defaultSqliteFile}` }, paths)).toBeNull();
      // The same file, written relative to the schema folder.
      expect(e2eResetProblem({ DATABASE_PROVIDER: 'sqlite', DATABASE_URL: 'file:../test.db' }, paths)).toBeNull();
    });

    it('refuses the dev database and any other file without E2E_ALLOW_RESET', () => {
      for (const url of ['file:../dev.db', 'file:/tmp/other/test.db']) {
        expect(e2eResetProblem({ DATABASE_PROVIDER: 'sqlite', DATABASE_URL: url }, paths)).toMatch(/E2E_ALLOW_RESET=1/);
      }
    });

    it('allows a custom file ending in test.db or e2e.db with E2E_ALLOW_RESET=1', () => {
      for (const url of ['file:/tmp/x/run-test.db', 'file:/tmp/x/e2e.db']) {
        expect(e2eResetProblem({ DATABASE_PROVIDER: 'sqlite', DATABASE_URL: url, E2E_ALLOW_RESET: '1' }, paths)).toBeNull();
      }
    });

    it('refuses a custom file whose name does not end in test.db or e2e.db, even with E2E_ALLOW_RESET=1', () => {
      for (const url of ['file:../dev.db', 'file:/tmp/x/data.db', 'file:/tmp/x/test.db.bak']) {
        expect(e2eResetProblem({ DATABASE_PROVIDER: 'sqlite', DATABASE_URL: url, E2E_ALLOW_RESET: '1' }, paths)).toMatch(
          /must end with "test.db" or "e2e.db"/,
        );
      }
    });

    it('refuses a URL that is not a file: URL', () => {
      expect(e2eResetProblem({ DATABASE_PROVIDER: 'sqlite', DATABASE_URL: 'postgresql://x' }, paths)).toMatch(/file: URL/);
    });
  });

  describe('PostgreSQL and MySQL', () => {
    it('allows parrotype_e2e on localhost with E2E_ALLOW_RESET=1', () => {
      expect(e2eResetProblem(pg('postgresql://parrotype:parrotype@localhost:5432/parrotype_e2e'), paths)).toBeNull();
      expect(e2eResetProblem(pg('postgres://u:p@127.0.0.1:5432/parrotype_e2e_run2'), paths)).toBeNull();
      expect(e2eResetProblem(pg('postgresql://u:p@[::1]:5432/app_test'), paths)).toBeNull();
      expect(e2eResetProblem(pg('postgresql://u:p@localhost:5432/_test'), paths)).toBeNull();
      expect(
        e2eResetProblem({ DATABASE_PROVIDER: 'mysql', DATABASE_URL: 'mysql://u:p@localhost:3306/parrotype_e2e', E2E_ALLOW_RESET: '1' }, paths),
      ).toBeNull();
    });

    it('refuses without E2E_ALLOW_RESET=1, even for a test-named local database', () => {
      const env = { DATABASE_PROVIDER: 'postgresql', DATABASE_URL: 'postgresql://u:p@localhost:5432/parrotype_e2e' };
      expect(e2eResetProblem(env, paths)).toMatch(/E2E_ALLOW_RESET=1/);
      expect(e2eResetProblem({ ...env, E2E_ALLOW_RESET: 'true' }, paths)).toMatch(/E2E_ALLOW_RESET=1/);
    });

    it('refuses the dev database (parrotype), however the flag is set', () => {
      expect(e2eResetProblem(pg('postgresql://parrotype:parrotype@localhost:5432/parrotype'), paths)).toMatch(
        /database "parrotype" does not look like a test database/,
      );
    });

    it('refuses names that only contain e2e or test somewhere else', () => {
      for (const name of ['e2e_parrotype', 'parrotype_e2x', 'test', 'parrotype_test_prod', 'my-e2e']) {
        expect(e2eResetProblem(pg(`postgresql://u:p@localhost:5432/${name}`), paths)).toMatch(/does not look like a test database/);
      }
    });

    it('refuses a remote host, even with a test-named database', () => {
      for (const host of ['db.example.com', '10.0.0.5', 'localhost.evil.com']) {
        expect(e2eResetProblem(pg(`postgresql://u:p@${host}:5432/parrotype_e2e`), paths)).toMatch(/is not local/);
      }
    });

    it('refuses a URL whose scheme does not match the provider', () => {
      expect(
        e2eResetProblem({ DATABASE_PROVIDER: 'postgresql', DATABASE_URL: 'mysql://u:p@localhost:3306/parrotype_e2e', E2E_ALLOW_RESET: '1' }, paths),
      ).toMatch(/does not match DATABASE_PROVIDER=postgresql/);
    });

    it('refuses an unknown provider and a missing URL', () => {
      expect(e2eResetProblem({ DATABASE_PROVIDER: 'oracle', DATABASE_URL: 'oracle://x', E2E_ALLOW_RESET: '1' }, paths)).toMatch(
        /unknown DATABASE_PROVIDER/,
      );
      expect(e2eResetProblem({ DATABASE_PROVIDER: 'postgresql', E2E_ALLOW_RESET: '1' }, paths)).toMatch(/DATABASE_URL is not set/);
    });
  });

  it('assertE2eResetAllowed throws a clear error before anything else happens', () => {
    expect(() => assertE2eResetAllowed(pg('postgresql://parrotype:parrotype@localhost:5432/parrotype'), paths)).toThrow(
      /^Refusing to reset the e2e database: database "parrotype" does not look like a test database/,
    );
    expect(() => assertE2eResetAllowed(pg('postgresql://u:p@localhost:5432/parrotype_e2e'), paths)).not.toThrow();
  });
});
