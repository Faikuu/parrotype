import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { SESSION_COOKIE } from '../auth/auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS, type Permission } from './catalog';
import { PermissionsGuard } from './permissions.guard';
import type { PermissionsService } from './permissions.service';

type Row = { id: number; name: string; tokenVersion: number; bannedAt: Date | null };

/**
 * A guard over a session cookie. `required` is what @RequirePermissions declared (undefined when the route
 * has no decorator). `held` is what the user's groups grant.
 */
function setup(options: { row?: Row | null; required?: Permission[]; held?: Permission[]; preset?: Set<Permission> } = {}) {
  const row: Row | null = options.row === undefined ? { id: 1, name: 'mod', tokenVersion: 0, bannedAt: null } : options.row;
  const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 1, v: 0 }) };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(row) } };
  const effective = jest.fn().mockResolvedValue(new Set(options.held ?? []));
  const permissions = { effective };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(options.required) };
  const guard = new PermissionsGuard(
    reflector as unknown as Reflector,
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
    permissions as unknown as PermissionsService,
  );
  const req = { cookies: { [SESSION_COOKIE]: 'signed.token' }, permissions: options.preset } as unknown as Request;
  const context = { getHandler: () => undefined, getClass: () => undefined, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { guard, req, context, effective };
}

describe('PermissionsGuard', () => {
  it('lets a holder of the required permission through, sets req.user and caches the permissions on req', async () => {
    const { guard, req, context, effective } = setup({ required: ['users.ban'], held: ['users.ban', 'admin.access'] });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ id: 1, name: 'mod' });
    expect(req.permissions).toEqual(new Set(['users.ban', 'admin.access']));
    expect(effective).toHaveBeenCalledTimes(1);
  });

  it('refuses a missing permission with 403 and names it', async () => {
    const { guard, context } = setup({ required: ['users.delete'], held: ['users.ban', 'admin.access'] });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow('Missing permission: users.delete');
  });

  it('needs every listed permission, not just one', async () => {
    const { guard, context } = setup({ required: ['users.read', 'users.delete'], held: ['users.read'] });
    await expect(guard.canActivate(context)).rejects.toThrow('Missing permission: users.delete');
  });

  it('requires admin.access when the route has no @RequirePermissions', async () => {
    // The service adds admin.access to anyone who holds a permission, so a holder of users.read passes.
    const reader = setup({ required: undefined, held: ['users.read', 'admin.access'] });
    await expect(reader.guard.canActivate(reader.context)).resolves.toBe(true);
    const none = setup({ required: undefined, held: [] });
    await expect(none.guard.canActivate(none.context)).rejects.toThrow('Missing permission: admin.access');
  });

  it('rejects a request without a session with 401, before any permission check', async () => {
    const { guard, context, req, effective } = setup({ required: ['users.read'] });
    (req as unknown as { cookies: object }).cookies = {};
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(effective).not.toHaveBeenCalled();
  });

  it('treats a suspended account as signed out (401)', async () => {
    const { guard, context } = setup({ row: { id: 1, name: 'mod', tokenVersion: 0, bannedAt: new Date(0) }, required: ['users.read'] });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reuses permissions already cached on the request instead of loading them again', async () => {
    const preset = new Set<Permission>(ALL_PERMISSIONS);
    const { guard, context, effective } = setup({ required: ['quotes.manage'], preset });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(effective).not.toHaveBeenCalled();
  });
});
