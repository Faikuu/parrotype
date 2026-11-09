import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';
import { SESSION_COOKIE } from './auth.service';

type Row = { id: number; name: string; tokenVersion: number; role: string; bannedAt: Date | null };

/** A database row as readSessionUser selects it, plus the token version the JWT must carry. */
function setup(row: Row | null, tokenPayload: Record<string, unknown> = { sub: 1, v: 0, role: 'admin' }) {
  const jwt = { verifyAsync: jest.fn().mockResolvedValue(tokenPayload) };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(row) } };
  const guard = new AdminGuard(jwt as unknown as JwtService, prisma as unknown as PrismaService);
  const req = { cookies: { [SESSION_COOKIE]: 'signed.token.here' } } as unknown as Request;
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { guard, req, context, prisma };
}

const admin: Row = { id: 1, name: 'root', tokenVersion: 0, role: 'admin', bannedAt: null };

describe('AdminGuard', () => {
  it('lets an admin through and sets req.user with the role', async () => {
    const { guard, req, context } = setup(admin);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ id: 1, name: 'root', role: 'admin' });
  });

  it('rejects a non-admin with 403, even when the token claims the admin role', async () => {
    const { guard, context } = setup({ ...admin, role: 'user' }, { sub: 1, v: 0, role: 'admin' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a request without a session with 401', async () => {
    const { guard, context, req } = setup(admin);
    (req as unknown as { cookies: object }).cookies = {};
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a banned admin with 401: the session reader treats a suspended account as signed out', async () => {
    const { guard, context } = setup({ ...admin, bannedAt: new Date(0) });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose version no longer matches (logged out or banned)', async () => {
    const { guard, context } = setup({ ...admin, tokenVersion: 3 }, { sub: 1, v: 2 });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a deleted user', async () => {
    const { guard, context } = setup(null);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
