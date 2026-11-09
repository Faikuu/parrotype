// Loads stack/backend/.env into process.env for the scripts. Variables already set in the environment win.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadDotEnv() {
  const envFile = join(backendRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
