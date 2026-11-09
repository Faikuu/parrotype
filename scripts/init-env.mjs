// Creates stack/backend/.env from the sample with freshly generated JWT_SECRET and TOTP_ENCRYPTION_KEY.
// Leaves an existing .env alone (an existing one from before 2.5 needs TOTP_ENCRYPTION_KEY added by hand).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const target = 'stack/backend/.env';
if (existsSync(target)) {
  console.log(`${target} already exists, leaving it as is.`);
} else {
  const sample = readFileSync('stack/backend/.env.sample', 'utf8');
  const secret = randomBytes(48).toString('base64url');
  const totpKey = randomBytes(48).toString('base64url');
  const env = sample
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
    .replace(/^TOTP_ENCRYPTION_KEY=.*$/m, `TOTP_ENCRYPTION_KEY=${totpKey}`);
  writeFileSync(target, env, { mode: 0o600 });
  console.log(`Created ${target} with a random JWT_SECRET and TOTP_ENCRYPTION_KEY.`);
}
