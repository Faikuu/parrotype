import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { SESSION_COOKIE } from './auth.service';

export interface AuthUser {
  id: number;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Reads the session cookie and verifies its signature and expiry.
 * Returns null when there is no cookie or it is invalid. Never trusts an unverified token.
 */
export async function readSessionUser(req: Request, jwt: JwtService): Promise<AuthUser | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0) return null;
  try {
    const payload = await jwt.verifyAsync<{ sub?: unknown; name?: unknown }>(token, {
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'number' || !Number.isInteger(payload.sub)) return null;
    if (typeof payload.name !== 'string') return null;
    return { id: payload.sub, name: payload.name };
  } catch {
    return null;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = await readSessionUser(req, this.jwt);
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}
