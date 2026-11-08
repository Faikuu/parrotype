#!/usr/bin/env node
// Runs the Prisma CLI against the schema for DATABASE_PROVIDER (default sqlite).
// Usage: node scripts/prisma.mjs <prisma args…>   e.g. migrate deploy, generate, db seed
// Loads .env first, but never overrides variables that are already set in the environment.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUrl, resolveProvider } from './providers.mjs';
import { writeSchema } from './prisma-schema.mjs';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => {
  console.error(`prisma: ${message}`);
  process.exit(1);
};

const envFile = join(backendRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
if (args.length === 0) fail('no Prisma arguments given (e.g. node scripts/prisma.mjs migrate deploy)');

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

writeSchema(provider);
const schema = `prisma/${provider}/schema.prisma`;
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

// `migrate diff` rejects --schema: it takes its schema from --to-schema-datamodel, which the caller passes.
const isDiff = args[0] === 'migrate' && args[1] === 'diff';
const cliArgs = isDiff || args.includes('--schema') ? args : [...args, '--schema', schema];

// Run the CLI with this Node binary, from the backend folder, so relative paths in the schema and migrations resolve.
const result = spawnSync(process.execPath, [prismaCli, ...cliArgs], {
  cwd: backendRoot,
  env: process.env,
  stdio: 'inherit',
});
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
