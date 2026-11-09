import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from './catalog';
import { PermissionsService } from './permissions.service';

jest.mock('../config/env', () => ({ getEnv: () => ({ DATABASE_PROVIDER: 'sqlite' }) }));

type Groups = Array<{ name: string; system: boolean; permissions: string[] }>;
type Account = { id: number; name?: string; tokenVersion?: number; bannedAt?: Date | null; groups: Groups };

/**
 * A database stand-in. effective() reads the user and then its groups with Prisma; loadAccount() makes one raw
 * statement, answered with one row per (group, permission), a null permission for a group without any, and no
 * row for an unknown user.
 */
function setup(accounts: Record<number, Account>) {
  const userFindUnique = jest.fn(async ({ where }: { where: { id: number } }) => {
    const account = accounts[where.id];
    return account ? { bannedAt: account.bannedAt ?? null } : null;
  });
  const groupFindMany = jest.fn(async ({ where }: { where: { members: { some: { userId: number } } } }) => {
    const account = accounts[where.members.some.userId];
    return (account?.groups ?? []).map((g) => ({
      name: g.name,
      system: g.system,
      permissions: g.permissions.map((permission) => ({ permission })),
    }));
  });
  const queryRaw = jest.fn(async (sql: { values: unknown[] }) => {
    const account = accounts[sql.values[0] as number];
    if (!account) return [];
    const base = {
      uid: account.id,
      uname: account.name ?? `user${account.id}`,
      utoken: account.tokenVersion ?? 0,
      ubanned: account.bannedAt ? 1 : 0,
    };
    const rows: Array<Record<string, unknown>> = [];
    if (account.groups.length === 0) rows.push({ ...base, gid: null, gname: null, gsystem: null, perm: null });
    account.groups.forEach((group, index) => {
      const gid = index + 1;
      const common = { ...base, gid, gname: group.name, gsystem: group.system ? 1 : 0 };
      if (group.permissions.length === 0) rows.push({ ...common, perm: null });
      for (const perm of group.permissions) rows.push({ ...common, perm });
    });
    return rows;
  });
  const prisma = { user: { findUnique: userFindUnique }, permissionGroup: { findMany: groupFindMany }, $queryRaw: queryRaw };
  return { service: new PermissionsService(prisma as unknown as PrismaService), userFindUnique, groupFindMany, queryRaw };
}

const MODERATORS = ['admin.access', 'users.read', 'users.ban', 'reports.read', 'reports.resolve', 'results.read', 'results.delete', 'audit.read'];

describe('PermissionsService.effective', () => {
  it('unions the groups, with the Administrators wildcard and admin.access', async () => {
    const { service } = setup({
      1: { id: 1, groups: [{ name: 'Administrators', system: true, permissions: [] }] },
      2: { id: 2, groups: [{ name: 'Moderators', system: false, permissions: MODERATORS }] },
      3: { id: 3, groups: [] },
    });
    expect(await service.effective(1)).toEqual(new Set(ALL_PERMISSIONS));
    expect([...(await service.effective(2))].sort()).toEqual([...new Set(MODERATORS)].sort());
    expect(await service.effective(3)).toEqual(new Set());
  });

  it('gives the empty set for a banned user and for a user who does not exist', async () => {
    const { service } = setup({
      1: { id: 1, bannedAt: new Date(0), groups: [{ name: 'Administrators', system: true, permissions: [] }] },
    });
    expect(await service.effective(1)).toEqual(new Set());
    expect(await service.effective(404)).toEqual(new Set());
  });

  it('reads the database each time (nothing is cached between calls)', async () => {
    const { service, groupFindMany } = setup({ 1: { id: 1, groups: [] } });
    await service.effective(1);
    await service.effective(1);
    expect(groupFindMany).toHaveBeenCalledTimes(2);
  });

  it('loads the account, its groups and their permissions in one statement, binding only the id', async () => {
    const { service, queryRaw } = setup({
      7: { id: 7, name: 'mod', tokenVersion: 3, groups: [{ name: 'Moderators', system: false, permissions: ['users.ban'] }] },
    });
    const account = await service.loadAccount(7);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(account).toEqual({
      id: 7,
      name: 'mod',
      tokenVersion: 3,
      banned: false,
      groups: [{ name: 'Moderators', system: false, permissions: ['users.ban'] }],
    });
    expect(await service.loadAccount(99)).toBeNull();
  });
});

describe('PermissionsService.assertCanActOn and assertCanGrant', () => {
  const ids = { mod: 1, admin: 2, plain: 3 };
  const accounts: Record<number, Account> = {
    [ids.mod]: { id: ids.mod, groups: [{ name: 'Moderators', system: false, permissions: MODERATORS }] },
    [ids.admin]: { id: ids.admin, groups: [{ name: 'Administrators', system: true, permissions: [] }] },
    [ids.plain]: { id: ids.plain, groups: [] },
  };

  it('forbids a moderator acting on an administrator, with the spec message', async () => {
    const { service } = setup(accounts);
    await expect(service.assertCanActOn(ids.mod, ids.admin)).rejects.toThrow(
      "You can't manage a user with permissions you don't have",
    );
    await expect(service.assertCanActOn(ids.mod, ids.admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still forbids acting on a suspended user who holds permissions the actor lacks', async () => {
    const { service } = setup({
      ...accounts,
      4: { id: 4, bannedAt: new Date(), groups: [{ name: 'Editors', system: false, permissions: ['users.read', 'users.delete'] }] },
    });
    // A suspended user can't use their permissions, but suspension must not lower their rank.
    expect(await service.effective(4)).toEqual(new Set());
    await expect(service.assertCanActOn(ids.mod, 4)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertCanActOn(ids.admin, 4)).resolves.toBeUndefined();
  });

  it('allows a moderator to act on an ordinary user, and an administrator on anyone', async () => {
    const { service } = setup(accounts);
    await expect(service.assertCanActOn(ids.mod, ids.plain)).resolves.toBeUndefined();
    await expect(service.assertCanActOn(ids.admin, ids.mod)).resolves.toBeUndefined();
  });

  it('names the missing permissions when the actor cannot grant them', async () => {
    const { service } = setup(accounts);
    await expect(service.assertCanGrant(ids.mod, ['users.ban', 'users.delete'])).rejects.toThrow(
      "You can't grant permissions you don't have: users.delete",
    );
    await expect(service.assertCanGrant(ids.mod, ['users.ban'])).resolves.toBeUndefined();
    await expect(service.assertCanGrant(ids.plain, [])).resolves.toBeUndefined();
  });
});
