import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { SESSION_COOKIE } from '../auth/auth.service';
import { ALL_PERMISSIONS, type Permission } from './catalog';
import { PermissionsGuard } from './permissions.guard';
import type { PermissionsService } from './permissions.service';

jest.mock('../config/env', () => ({ getEnv: () => ({ DATABASE_PROVIDER: 'sqlite' }) }));

type Account = { id: number; name: string; tokenVersion: number; banned: boolean; groups: Array<{ name: string; system: boolean; permissions: string[] }> } | null;

/**
 * A guard over a session cookie. `required` is what @RequirePermissions declared (undefined when the route
 * has no decorator). `held` is what the account's groups grant. `version` is the token's claim.
 */
function setup(options: { account?: Account; required?: Permission[]; held?: Permission[]; preset?: Set<Permission>; version?: number } = {}) {
  const account: Account =
    options.account === undefined
      ? { id: 1, name: 'mod', tokenVersion: 0, banned: false, groups: [{ name: 'Moderators', system: false, permissions: options.held ?? [] }] }
      : options.account;
  const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 1, v: options.version ?? 0 }) };
  const loadAccount = jest.fn().mockResolvedValue(account);
  const permissions = { loadAccount };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(options.required) };
  const guard = new PermissionsGuard(
    reflector as unknown as Reflector,
    jwt as unknown as JwtService,
    permissions as unknown as PermissionsService,
  );
  const req = { cookies: { [SESSION_COOKIE]: 'signed.token' }, permissions: options.preset } as unknown as Request;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { guard, req, context, loadAccount };
}

describe('PermissionsGuard', () => {
  it('lets a holder of the required permission through, sets req.user and caches the permissions on req', async () => {
    const { guard, req, context, loadAccount } = setup({ required: ['users.ban'], held: ['users.ban'] });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ id: 1, name: 'mod' });
    expect(req.permissions).toEqual(new Set(['users.ban', 'admin.access']));
    expect(loadAccount).toHaveBeenCalledTimes(1);
    expect(loadAccount).toHaveBeenCalledWith(1);
  });

  it('refuses a missing permission with 403 and names it', async () => {
    const { guard, context } = setup({ required: ['users.delete'], held: ['users.ban'] });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow('Missing permission: users.delete');
  });

  it('needs every listed permission, not just one', async () => {
    const { guard, context } = setup({ required: ['users.read', 'users.delete'], held: ['users.read'] });
    await expect(guard.canActivate(context)).rejects.toThrow('Missing permission: users.delete');
  });

  it('requires admin.access when the route has no @RequirePermissions; any permission grants it', async () => {
    const reader = setup({ required: undefined, held: ['users.read'] });
    await expect(reader.guard.canActivate(reader.context)).resolves.toBe(true);
    const none = setup({ required: undefined, held: [] });
    await expect(none.guard.canActivate(none.context)).rejects.toThrow('Missing permission: admin.access');
  });

  it('rejects a request without a session with 401, before any database read', async () => {
    const { guard, context, req, loadAccount } = setup({ required: ['users.read'] });
    (req as unknown as { cookies: object }).cookies = {};
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('rejects a deleted account with 401', async () => {
    const { guard, context } = setup({ account: null, required: ['users.read'] });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('treats a suspended account as signed out (401)', async () => {
    const { guard, context } = setup({
      account: { id: 1, name: 'mod', tokenVersion: 0, banned: true, groups: [{ name: 'Administrators', system: true, permissions: [] }] },
      required: ['users.read'],
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose version no longer matches the account (logged out or renamed)', async () => {
    const { guard, context } = setup({ version: 2, required: ['users.read'], held: ['users.read'] });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reuses permissions already cached on the request instead of loading them again', async () => {
    const preset = new Set<Permission>(ALL_PERMISSIONS);
    const { guard, context, loadAccount } = setup({ required: ['quotes.manage'], preset });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(loadAccount).toHaveBeenCalledTimes(1);
  });
});
