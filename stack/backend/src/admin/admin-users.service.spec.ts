import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { UserEvents } from '../common/user-events';
import type { PermissionsService } from '../permissions/permissions.service';
import { AdminUsersService } from './admin-users.service';

const me: AuthUser = { id: 1, name: 'root' };
const FORBIDDEN = new ForbiddenException("You can't manage a user with permissions you don't have");

type Row = Record<string, unknown>;

/** A user row as the list and detail selects return it. */
const userRow = (over: Row = {}): Row => ({
  id: 7,
  name: 'typist',
  email: 'typist@example.com',
  createdAt: new Date(0),
  bannedAt: null,
  banReason: null,
  groups: [],
  _count: { results: 0 },
  ...over,
});

/**
 * A prisma stand-in. writeTx runs its callback against the same mocks, so writes inside it are
 * visible to the test next to the audit row they must share.
 */
function setup(options: {
  user?: Row | null;
  /** Count the conditional user writes match (1 when the state allows the change, 0 when not). */
  matches?: number;
  /** Stored group rows for the groups named in a PUT /users/:id/groups call. */
  groups?: Row[];
  /** Current memberships of the target (group ids). */
  memberships?: number[];
  /** Members of the Administrators group (user ids). */
  adminMembers?: number[];
  adminGroupId?: number | null;
  /** Membership of the target in the Administrators group, for delete. */
  targetIsAdmin?: boolean;
  actOn?: Error | null;
  grant?: Error | null;
} = {}) {
  const matches = options.matches ?? 1;
  const adminGroupId = options.adminGroupId === undefined ? 2 : options.adminGroupId;
  const db = {
    user: {
      findUnique: jest.fn().mockResolvedValue(options.user === undefined ? userRow() : options.user),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: matches }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    userGroup: {
      findMany: jest.fn(async ({ where }: { where: { groupId?: number; userId?: number } }) => {
        if (where.groupId !== undefined) return (options.adminMembers ?? []).map((userId) => ({ userId }));
        return (options.memberships ?? []).map((groupId) => ({ groupId }));
      }),
      findUnique: jest.fn().mockResolvedValue(options.targetIsAdmin ? { userId: 7 } : null),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    permissionGroup: {
      findFirst: jest.fn().mockResolvedValue(adminGroupId === null ? null : { id: adminGroupId }),
      findMany: jest.fn().mockResolvedValue(options.groups ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    result: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _max: { wpm: null } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    report: { findMany: jest.fn().mockResolvedValue([]) },
    adminAction: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = Object.assign(db, {
    writeTx: jest.fn((cb: (tx: typeof db) => Promise<unknown>) => cb(db)),
  });
  const permissions = {
    assertCanActOn: jest.fn().mockImplementation(async () => {
      if (options.actOn) throw options.actOn;
    }),
    assertCanGrant: jest.fn().mockImplementation(async () => {
      if (options.grant) throw options.grant;
    }),
    effective: jest.fn().mockResolvedValue(new Set()),
  };
  const events = new UserEvents();
  const service = new AdminUsersService(
    prisma as unknown as PrismaService,
    permissions as unknown as PermissionsService,
    events,
  );
  return { service, prisma, permissions, events };
}

describe('AdminUsersService.ban', () => {
  it('suspends the user, bumps tokenVersion, logs it in the same transaction, and emits banned', async () => {
    const { service, prisma, events, permissions } = setup({ user: userRow({ bannedAt: null }) });
    const banned = jest.fn();
    events.on('banned', banned);

    await service.ban(me, 7, 'spam accounts');

    expect(permissions.assertCanActOn).toHaveBeenCalledWith(1, 7);
    expect(prisma.writeTx).toHaveBeenCalledTimes(1);
    const call = prisma.user.updateMany.mock.calls[0][0] as { where: Row; data: Row };
    expect(call.where).toEqual({
      id: 7,
      bannedAt: null,
      groups: { none: { group: { name: 'Administrators', system: true } } },
    });
    expect(call.data).toEqual(expect.objectContaining({ banReason: 'spam accounts', tokenVersion: { increment: 1 } }));
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'ban', target: 'user:7', note: 'spam accounts' },
    });
    expect(banned).toHaveBeenCalledWith(7);
  });

  it('refuses a self ban with 400 before anything is read or written', async () => {
    const { service, prisma } = setup();
    await expect(service.ban(me, 1, 'x')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('gives 404 for an unknown user and 403 when the actor cannot act on the target, with no write', async () => {
    const missing = setup({ user: null });
    await expect(missing.service.ban(me, 99, 'x')).rejects.toBeInstanceOf(NotFoundException);

    const forbidden = setup({ actOn: FORBIDDEN });
    await expect(forbidden.service.ban(me, 7, 'x')).rejects.toBeInstanceOf(ForbiddenException);
    expect(forbidden.prisma.user.updateMany).not.toHaveBeenCalled();
    expect(forbidden.prisma.adminAction.create).not.toHaveBeenCalled();
  });

  it('refuses an Administrator with 400 when the conditional write misses, and writes no audit row', async () => {
    const { service, prisma, events } = setup({
      matches: 0,
      user: userRow({ groups: [{ group: { id: 2, name: 'Administrators', system: true } }] }),
    });
    const banned = jest.fn();
    events.on('banned', banned);
    await expect(service.ban(me, 7, 'x')).rejects.toThrow("Administrators can't be banned");
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
    expect(banned).not.toHaveBeenCalled();
  });

  it('gives 409 for a user who is already suspended', async () => {
    const { service, prisma } = setup({ matches: 0, user: userRow({ bannedAt: new Date(0) }) });
    await expect(service.ban(me, 7, 'again')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.unban', () => {
  it('clears the suspension and logs it', async () => {
    const { service, prisma } = setup({ user: userRow({ bannedAt: new Date(0), banReason: 'x' }) });
    await service.unban(me, 7);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7, bannedAt: { not: null } },
      data: { bannedAt: null, banReason: null },
    });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({ data: { adminId: 1, action: 'unban', target: 'user:7' } });
  });

  it('refuses a user who is not suspended with 409', async () => {
    const { service, prisma } = setup({ matches: 0 });
    await expect(service.unban(me, 7)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.rename', () => {
  it('bumps tokenVersion with the new name and logs both names', async () => {
    const { service, prisma } = setup();
    await service.rename(me, 7, 'Renamed_1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { name: 'Renamed_1', nameLower: 'renamed_1', tokenVersion: { increment: 1 } },
    });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'user_rename', target: 'user:7', note: '{"from":"typist","to":"Renamed_1"}' },
    });
  });

  it('refuses a name another account holds (case-insensitively) with 409 and changes nothing', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValueOnce({ id: 8 });
    await expect(service.rename(me, 7, 'OTHER')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does nothing when the name is unchanged', async () => {
    const { service, prisma } = setup();
    await service.rename(me, 7, 'typist');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.setGroups', () => {
  const moderators = { id: 3, name: 'Moderators', system: false, permissions: [{ permission: 'users.ban' }] };
  const admins = { id: 2, name: 'Administrators', system: true, permissions: [] };

  it('rejects an unknown group id with 400', async () => {
    const { service, prisma } = setup({ groups: [moderators] });
    await expect(service.setGroups(me, 7, { groupIds: [3, 42] })).rejects.toThrow('Unknown group id: 42');
    expect(prisma.writeTx).not.toHaveBeenCalled();
  });

  it('is a no-op when the memberships already match', async () => {
    const { service, prisma } = setup({ groups: [moderators], memberships: [3] });
    await service.setGroups(me, 7, { groupIds: [3] });
    expect(prisma.writeTx).not.toHaveBeenCalled();
  });

  it('asks the grant check for every group added or removed, and the act-on check for the target', async () => {
    const { service, permissions } = setup({ groups: [moderators, admins], memberships: [3] });
    await service.setGroups(me, 7, { groupIds: [2] });
    expect(permissions.assertCanActOn).toHaveBeenCalledWith(1, 7);
    // Moderators is removed and Administrators added: the grant check covers the union of both.
    const granted = permissions.assertCanGrant.mock.calls[0][1] as string[];
    expect(granted).toEqual(expect.arrayContaining(['users.ban', 'users.delete']));
    expect(granted).toContain('admin.access');
  });

  it('refuses a suspended user joining a group, with 400', async () => {
    const { service, prisma } = setup({ groups: [moderators], memberships: [], user: userRow({ bannedAt: new Date(0) }) });
    await expect(service.setGroups(me, 7, { groupIds: [3] })).rejects.toThrow("Suspended users can't be added to groups");
    expect(prisma.writeTx).not.toHaveBeenCalled();
  });

  it('refuses to remove the last Administrator, with 400, and writes nothing', async () => {
    const { service, prisma } = setup({ groups: [admins], memberships: [2], adminMembers: [7] });
    await expect(service.setGroups(me, 7, { groupIds: [] })).rejects.toThrow('Administrators needs at least one member');
    expect(prisma.userGroup.deleteMany).not.toHaveBeenCalled();
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
  });

  it('removes an Administrator who is not the last, and logs the change', async () => {
    const { service, prisma } = setup({ groups: [admins], memberships: [2], adminMembers: [7, 8] });
    await service.setGroups(me, 7, { groupIds: [] });
    expect(prisma.userGroup.deleteMany).toHaveBeenCalledWith({ where: { userId: 7, groupId: { in: [2] } } });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'user_groups', target: 'user:7', note: '{"added":[],"removed":[2]}' },
    });
  });

  it('adds memberships and logs the added ids', async () => {
    const { service, prisma } = setup({ groups: [moderators], memberships: [] });
    await service.setGroups(me, 7, { groupIds: [3, 3] });
    expect(prisma.userGroup.createMany).toHaveBeenCalledWith({ data: [{ userId: 7, groupId: 3 }] });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'user_groups', target: 'user:7', note: '{"added":[3],"removed":[]}' },
    });
  });
});

describe('AdminUsersService.remove', () => {
  it('deletes the account after the typed name matches, and emits banned to close race sockets', async () => {
    const { service, prisma, events } = setup();
    const banned = jest.fn();
    events.on('banned', banned);
    await expect(service.remove(me, 7, { confirm: 'typist' })).resolves.toEqual({ ok: true });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'user_delete', target: 'user:7', note: '{"name":"typist"}' },
    });
    expect(banned).toHaveBeenCalledWith(7);
  });

  it('refuses a confirmation that differs from the name, including by case', async () => {
    const { service, prisma } = setup();
    await expect(service.remove(me, 7, { confirm: 'Typist' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete yourself with 400', async () => {
    const { service, prisma } = setup({ user: userRow({ id: 1, name: 'root' }) });
    await expect(service.remove(me, 1, { confirm: 'root' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete the last Administrator, and deletes nothing', async () => {
    const { service, prisma } = setup({ targetIsAdmin: true, adminMembers: [7] });
    await expect(service.remove(me, 7, { confirm: 'typist' })).rejects.toThrow('Administrators needs at least one member');
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('gives 403 when the actor cannot act on the target', async () => {
    const { service, prisma } = setup({ actOn: FORBIDDEN });
    await expect(service.remove(me, 7, { confirm: 'typist' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.revokeSessions', () => {
  it('bumps tokenVersion and logs it; allowed on yourself', async () => {
    const { service, prisma } = setup({ user: userRow({ id: 1, name: 'root' }) });
    await expect(service.revokeSessions(me, 1)).resolves.toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { tokenVersion: { increment: 1 } } });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'user_revoke_sessions', target: 'user:1' },
    });
  });
});

describe('AdminUsersService.idForName', () => {
  it('resolves a valid name case-insensitively and 404s anything else', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id: 7 });
    await expect(service.idForName('TYPIST')).resolves.toBe(7);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { nameLower: 'typist' }, select: { id: true } });
    await expect(service.idForName('a!')).rejects.toBeInstanceOf(NotFoundException);
  });
});
