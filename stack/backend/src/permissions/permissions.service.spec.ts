import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from './catalog';
import { PermissionsService } from './permissions.service';

type Groups = Array<{ name: string; system: boolean; permissions: string[] }>;

/** A user whose effective set comes from the given groups. `null` means the user does not exist. */
function setup(users: Record<number, { bannedAt?: Date | null; groups: Groups } | null>) {
  const findUnique = jest.fn(async ({ where }: { where: { id: number } }) => {
    const row = users[where.id];
    if (!row) return null;
    return {
      bannedAt: row.bannedAt ?? null,
      groups: row.groups.map((g) => ({
        group: { name: g.name, system: g.system, permissions: g.permissions.map((permission) => ({ permission })) },
      })),
    };
  });
  const prisma = { user: { findUnique } };
  return { service: new PermissionsService(prisma as unknown as PrismaService), findUnique };
}

const MODERATORS = ['admin.access', 'users.read', 'users.ban', 'reports.read', 'reports.resolve', 'results.read', 'results.delete', 'audit.read'];

describe('PermissionsService.effective', () => {
  it('unions the groups, with the Administrators wildcard and admin.access', async () => {
    const { service } = setup({
      1: { groups: [{ name: 'Administrators', system: true, permissions: [] }] },
      2: { groups: [{ name: 'Moderators', system: false, permissions: MODERATORS }] },
      3: { groups: [] },
    });
    expect(await service.effective(1)).toEqual(new Set(ALL_PERMISSIONS));
    expect([...(await service.effective(2))].sort()).toEqual([...new Set(MODERATORS)].sort());
    expect(await service.effective(3)).toEqual(new Set());
  });

  it('gives the empty set for a banned user and for a user who does not exist', async () => {
    const { service } = setup({
      1: { bannedAt: new Date(0), groups: [{ name: 'Administrators', system: true, permissions: [] }] },
    });
    expect(await service.effective(1)).toEqual(new Set());
    expect(await service.effective(404)).toEqual(new Set());
  });

  it('reads from the database each time (nothing is cached between calls)', async () => {
    const { service, findUnique } = setup({ 1: { groups: [] } });
    await service.effective(1);
    await service.effective(1);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('PermissionsService.assertCanActOn and assertCanGrant', () => {
  const ids = { mod: 1, admin: 2, plain: 3 };
  const users = {
    [ids.mod]: { groups: [{ name: 'Moderators', system: false, permissions: MODERATORS }] },
    [ids.admin]: { groups: [{ name: 'Administrators', system: true, permissions: [] }] },
    [ids.plain]: { groups: [] },
  };

  it('forbids a moderator acting on an administrator, with the spec message', async () => {
    const { service } = setup(users);
    await expect(service.assertCanActOn(ids.mod, ids.admin)).rejects.toThrow(
      "You can't manage a user with permissions you don't have",
    );
    await expect(service.assertCanActOn(ids.mod, ids.admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a moderator to act on an ordinary user, and an administrator on anyone', async () => {
    const { service } = setup(users);
    await expect(service.assertCanActOn(ids.mod, ids.plain)).resolves.toBeUndefined();
    await expect(service.assertCanActOn(ids.admin, ids.mod)).resolves.toBeUndefined();
  });

  it('names the missing permissions when the actor cannot grant them', async () => {
    const { service } = setup(users);
    await expect(service.assertCanGrant(ids.mod, ['users.ban', 'users.delete'])).rejects.toThrow(
      "You can't grant permissions you don't have: users.delete",
    );
    await expect(service.assertCanGrant(ids.mod, ['users.ban'])).resolves.toBeUndefined();
    await expect(service.assertCanGrant(ids.plain, [])).resolves.toBeUndefined();
  });
});
