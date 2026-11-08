// Creates stack/backend/.env from the sample with a freshly generated JWT secret.
// Leaves an existing .env alone.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const target = 'stack/backend/.env';
if (existsSync(target)) {
  console.log(`${target} already exists, leaving it as is.`);
} else {
  const sample = readFileSync('stack/backend/.env.sample', 'utf8');
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(target, sample.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`), { mode: 0o600 });
  console.log(`Created ${target} with a random JWT_SECRET.`);
}
