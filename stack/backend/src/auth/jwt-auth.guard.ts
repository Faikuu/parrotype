import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
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

/** The verified claims of a session cookie. `version` is the tokenVersion the token was issued with. */
export interface SessionClaims {
  sub: number;
  version: unknown;
}

/**
 * Reads the session cookie and verifies its signature and expiry. Returns null for no cookie, an invalid
 * token, or a token without a numeric subject. It reads no database row: callers check the account.
 */
export async function readSessionClaims(req: Request, jwt: JwtService): Promise<SessionClaims | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0) return null;
  try {
    const payload = await jwt.verifyAsync<{ sub?: unknown; v?: unknown }>(token, {
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'number' || !Number.isInteger(payload.sub)) return null;
    return { sub: payload.sub, version: payload.v };
  } catch {
    return null;
  }
}

/**
 * Reads the session cookie, verifies its signature and expiry, then checks it against the
 * user's current tokenVersion (bumped on logout). Returns null when there is no cookie, the
 * token is invalid, the user no longer exists, the token was revoked, or the account is
 * suspended (bannedAt set). Never trusts an unverified token. Permissions are not read here: the
 * PermissionsGuard loads them per request.
 */
export async function readSessionUser(
  req: Request,
  jwt: JwtService,
  prisma: PrismaService,
): Promise<AuthUser | null> {
  const claims = await readSessionClaims(req, jwt);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, tokenVersion: true, bannedAt: true },
  });
  if (!user || user.bannedAt || claims.version !== user.tokenVersion) return null;
  return { id: user.id, name: user.name };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = await readSessionUser(req, this.jwt, this.prisma);
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}
