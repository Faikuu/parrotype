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

/**
 * Reads the session cookie, verifies its signature and expiry, then checks it against the
 * user's current tokenVersion (bumped on logout). Returns null when there is no cookie, the
 * token is invalid, the user no longer exists, or the token was revoked. Never trusts an
 * unverified token.
 */
export async function readSessionUser(
  req: Request,
  jwt: JwtService,
  prisma: PrismaService,
): Promise<AuthUser | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0) return null;

  let sub: number;
  let version: unknown;
  try {
    const payload = await jwt.verifyAsync<{ sub?: unknown; v?: unknown }>(token, {
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'number' || !Number.isInteger(payload.sub)) return null;
    sub = payload.sub;
    version = payload.v;
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: sub },
    select: { id: true, name: true, tokenVersion: true },
  });
  if (!user || version !== user.tokenVersion) return null;
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
