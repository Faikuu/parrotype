import { createHmac, randomBytes } from 'node:crypto';
import type { JwtService } from '@nestjs/jwt';
import { getEnv } from '../config/env';

/**
 * The short-lived ticket that stands in for a session between the password step and the second factor.
 * It is signed with a key derived from JWT_SECRET for this purpose alone, so a session cookie is not a
 * valid ticket and a ticket is not a valid session cookie. It also carries purpose "2fa", which the
 * session reader refuses as a second check.
 *
 * Single use and newest only: the ticket carries a random nonce, and the user row holds the nonce of the
 * newest login (loginTicketNonce). A ticket is spent by clearing that nonce in a conditional write, so an
 * older ticket (superseded by a newer login) and a ticket already used are both refused.
 */
export const TICKET_PURPOSE = '2fa';
export const TICKET_LIFETIME = '5m';
const NONCE_FORMAT = /^[0-9a-f]{32}$/;

export function ticketKey(jwtSecret: string): Buffer {
  return createHmac('sha256', jwtSecret).update('parrotype:2fa-ticket:v1', 'utf8').digest();
}

/** A new login nonce: 16 random bytes, hex encoded. Stored on the user and carried in the ticket. */
export function newLoginNonce(): string {
  return randomBytes(16).toString('hex');
}

export interface TicketClaims {
  /** The user id. */
  sub: number;
  /** The tokenVersion the ticket was issued with. A password change or logout invalidates it. */
  v: number;
  /** The login nonce. Valid only while it equals User.loginTicketNonce. */
  n: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

export function signTicket(jwt: JwtService, user: { id: number; tokenVersion: number }, nonce: string): Promise<string> {
  return jwt.signAsync(
    { sub: user.id, v: user.tokenVersion, purpose: TICKET_PURPOSE, n: nonce },
    { secret: ticketKey(getEnv().JWT_SECRET), expiresIn: TICKET_LIFETIME, algorithm: 'HS256' },
  );
}

/** Verifies the signature, expiry, purpose and shape. Returns null for anything else. */
export async function readTicket(jwt: JwtService, token: string): Promise<TicketClaims | null> {
  try {
    const payload = await jwt.verifyAsync<Record<string, unknown>>(token, {
      secret: ticketKey(getEnv().JWT_SECRET),
      algorithms: ['HS256'],
    });
    if (payload.purpose !== TICKET_PURPOSE) return null;
    if (typeof payload.sub !== 'number' || !Number.isInteger(payload.sub)) return null;
    if (typeof payload.v !== 'number' || typeof payload.exp !== 'number') return null;
    if (typeof payload.n !== 'string' || !NONCE_FORMAT.test(payload.n)) return null;
    return { sub: payload.sub, v: payload.v, n: payload.n, exp: payload.exp };
  } catch {
    return null;
  }
}
