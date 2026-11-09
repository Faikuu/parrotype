import { createHash, randomBytes } from 'node:crypto';

/** The clock the time-limited auth tokens read. Injected so tests can run with a stub clock. */
export const AUTH_CLOCK = Symbol('AUTH_CLOCK');
export type Clock = () => Date;

export const RESET_TOKEN_MINUTES = 30;
export const VERIFY_TOKEN_HOURS = 24;
/** Rate limits on the emails sent per account. */
export const RESET_PER_EMAIL_PER_HOUR = 3;
export const VERIFY_PER_ACCOUNT_PER_HOUR = 3;

/** A random URL-safe token of 32 bytes (43 characters). Only its sha256 is stored. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export const HOUR_MS = 60 * 60 * 1000;
