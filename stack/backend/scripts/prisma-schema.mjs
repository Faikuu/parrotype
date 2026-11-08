#!/usr/bin/env node
// Renders prisma/schema.template.prisma into prisma/<provider>/schema.prisma.
// Usage: node scripts/prisma-schema.mjs <sqlite|postgresql|mysql> | --all
// The rendered files are committed. Re-run this after editing the template.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS } from './providers.mjs';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(backendRoot, 'prisma', 'schema.template.prisma');

// Long text is TEXT on mysql and postgresql; sqlite has no size limit, so it stays plain.
// Emails are capped at 254 chars, so they get an explicit VARCHAR (MySQL would default to 191).
const PLACEHOLDERS = {
  sqlite: { longText: '', emailType: '' },
  postgresql: { longText: '@db.Text', emailType: '@db.VarChar(254)' },
  mysql: { longText: '@db.Text', emailType: '@db.VarChar(254)' },
};

export function schemaPathFor(provider) {
  return join(backendRoot, 'prisma', provider, 'schema.prisma');
}

export function renderSchema(provider) {
  if (!PLACEHOLDERS[provider]) throw new Error(`Unknown provider "${provider}"`);
  const values = { provider, ...PLACEHOLDERS[provider] };
  const body = readFileSync(TEMPLATE, 'utf8').replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Unknown placeholder ${match} in schema.template.prisma`);
    return values[key];
  });
  const header = '// GENERATED from prisma/schema.template.prisma by scripts/prisma-schema.mjs. Do not edit.\n';
  // Trailing spaces left by empty placeholders are removed so the output stays clean.
  return header + body.split('\n').map((line) => line.trimEnd()).join('\n');
}

/** Writes prisma/<provider>/schema.prisma, leaving the file alone when it already matches. */
export function writeSchema(provider) {
  const file = schemaPathFor(provider);
  const content = renderSchema(provider);
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return file;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function main(argv) {
  const targets = argv[0] === '--all' ? PROVIDERS : argv;
  if (targets.length === 0) {
    console.error(`Usage: node scripts/prisma-schema.mjs <${PROVIDERS.join('|')}> | --all`);
    process.exit(1);
  }
  for (const provider of targets) {
    console.log(`rendered ${writeSchema(provider)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
