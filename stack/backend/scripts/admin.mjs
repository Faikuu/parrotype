#!/usr/bin/env node
// Runs scripts/admin.ts with ts-node, after the same .env loading as scripts/prisma.mjs.
// Usage: npm run admin -- grant <name> | revoke <name> | list
// It never generates the Prisma client. It refuses to run when the generated client was made for another engine.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendRoot, loadDotEnv } from './env.mjs';
import { checkUrl, resolveProvider } from './providers.mjs';

const require = createRequire(import.meta.url);
const fail = (message) => {
  console.error(`admin: ${message}`);
  process.exit(1);
};

loadDotEnv();

let provider;
try {
  provider = resolveProvider(process.env.DATABASE_PROVIDER);
} catch (err) {
  fail(err.message);
}
if (process.env.DATABASE_URL) {
  const problem = checkUrl(provider, process.env.DATABASE_URL);
  if (problem) fail(problem);
}

// The client is generated for one engine (the provider in its schema.prisma). Using another one fails in
// confusing ways, so say what to run instead.
const generatedSchema = join(dirname(require.resolve('.prisma/client/default')), 'schema.prisma');
const generatedProvider = existsSync(generatedSchema)
  ? /provider\s*=\s*"(\w+)"/.exec(readFileSync(generatedSchema, 'utf8').split('datasource')[1] ?? '')?.[1]
  : undefined;
if (generatedProvider !== provider) {
  fail(
    `the Prisma client was generated for ${generatedProvider ?? 'an unknown engine'}, but DATABASE_PROVIDER is ${provider}. ` +
      'Run `npm run prisma:generate` first.',
  );
}

const tsNodeRegister = require.resolve('ts-node/register/transpile-only');
const script = join(backendRoot, 'scripts', 'admin.ts');
const result = spawnSync(process.execPath, ['-r', tsNodeRegister, script, ...process.argv.slice(2)], {
  cwd: backendRoot,
  env: process.env,
  stdio: 'inherit',
});
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
