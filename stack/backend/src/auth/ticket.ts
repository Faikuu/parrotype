import { createHmac, randomBytes } from 'node:crypto';
import type { JwtService } from '@nestjs/jwt';
import { getEnv } from '../config/env';

/**
 * The short-lived ticket that stands in for a session between the password step and the second factor.
 * It is signed with a key derived from JWT_SECRET for this purpose alone, so a session cookie is not a
 * valid ticket and a ticket is not a valid session cookie. It also carries purpose "2fa", which the
 * session reader refuses as a second check.
 */
export const TICKET_PURPOSE = '2fa';
export const TICKET_LIFETIME = '5m';

export function ticketKey(jwtSecret: string): Buffer {
  return createHmac('sha256', jwtSecret).update('parrotype:2fa-ticket:v1', 'utf8').digest();
}

export interface TicketClaims {
  /** The user id. */
  sub: number;
  /** The tokenVersion the ticket was issued with. A password change or logout invalidates it. */
  v: number;
  /** Unique per ticket. A ticket that has completed a sign-in is not accepted again. */
  jti: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

export function signTicket(jwt: JwtService, user: { id: number; tokenVersion: number }): Promise<string> {
  return jwt.signAsync(
    { sub: user.id, v: user.tokenVersion, purpose: TICKET_PURPOSE, jti: randomBytes(16).toString('base64url') },
    { secret: ticketKey(getEnv().JWT_SECRET), expiresIn: TICKET_LIFETIME, algorithm: 'HS256' },
  );
}

/** Verifies the signature, expiry and purpose. Returns null for anything else. */
export async function readTicket(jwt: JwtService, token: string): Promise<TicketClaims | null> {
  try {
    const payload = await jwt.verifyAsync<Record<string, unknown>>(token, {
      secret: ticketKey(getEnv().JWT_SECRET),
      algorithms: ['HS256'],
    });
    if (payload.purpose !== TICKET_PURPOSE) return null;
    if (typeof payload.sub !== 'number' || !Number.isInteger(payload.sub)) return null;
    if (typeof payload.v !== 'number' || typeof payload.jti !== 'string' || typeof payload.exp !== 'number') return null;
    return { sub: payload.sub, v: payload.v, jti: payload.jti, exp: payload.exp };
  } catch {
    return null;
  }
}
