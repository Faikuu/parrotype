import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/jwt-auth.guard';
import type { PermissionsService } from '../permissions/permissions.service';
import { AdminGroupsService } from './admin-groups.service';

const me: AuthUser = { id: 1, name: 'manager' };
type Row = Record<string, unknown>;

const groupRow = (over: Row = {}): Row => ({
  id: 3,
  name: 'Moderators',
  description: 'Reviews reports',
  system: false,
  updatedAt: new Date(1000),
  permissions: [{ permission: 'users.ban' }, { permission: 'users.read' }],
  _count: { members: 2 },
  ...over,
});
const ADMIN_ROW = groupRow({ id: 2, name: 'Administrators', description: '', system: true, permissions: [] });

function setup(options: {
  group?: Row | null;
  /** Rows returned by permissionGroup.findMany (used for the name-clash check). */
  allGroups?: Array<{ id: number; name: string }>;
  user?: Row | null;
  existingMembership?: boolean;
  adminMembers?: number[];
  grant?: Error | null;
  actOn?: Error | null;
  /** Count the conditional group write matches. */
  matches?: number;
} = {}) {
  const matches = options.matches ?? 1;
  const db = {
    permissionGroup: {
      findUnique: jest.fn().mockResolvedValue(options.group === undefined ? groupRow() : options.group),
      findMany: jest.fn().mockResolvedValue(options.allGroups ?? []),
      create: jest.fn().mockResolvedValue({ id: 9 }),
      updateMany: jest.fn().mockResolvedValue({ count: matches }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    groupPermission: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(options.user === undefined ? { id: 7, name: 'typist', bannedAt: null } : options.user),
    },
    userGroup: {
      findUnique: jest.fn().mockResolvedValue(options.existingMembership ? { userId: 7 } : null),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue((options.adminMembers ?? []).map((userId) => ({ userId }))),
    },
    adminAction: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = Object.assign(db, {
    writeTx: jest.fn((cb: (tx: typeof db) => Promise<unknown>) => cb(db)),
  });
  const permissions = {
    assertCanGrant: jest.fn().mockImplementation(async () => {
      if (options.grant) throw options.grant;
    }),
    assertCanActOn: jest.fn().mockImplementation(async () => {
      if (options.actOn) throw options.actOn;
    }),
  };
  const service = new AdminGroupsService(prisma as unknown as PrismaService, permissions as unknown as PermissionsService);
  return { service, prisma, permissions };
}

describe('AdminGroupsService.create', () => {
  it('asks the grant check for the requested permissions plus the implied reads, and reports what was implied', async () => {
    const { service, permissions, prisma } = setup({ allGroups: [] });
    const result = await service.create(me, { name: 'Support', description: '', permissions: ['users.ban'] });
    expect(permissions.assertCanGrant).toHaveBeenCalledWith(1, ['users.ban', 'users.read']);
    expect(result.impliedAdded).toEqual(['users.read']);
    expect(prisma.permissionGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Support', permissions: { create: [{ permission: 'users.ban' }, { permission: 'users.read' }] } }),
      }),
    );
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'group_create', target: 'group:9', note: '{"name":"Support","permissions":["users.ban","users.read"]}' },
    });
  });

  it('refuses a group that grants a permission the actor does not hold: 403, nothing written', async () => {
    const { service, prisma } = setup({ grant: new ForbiddenException("You can't grant permissions you don't have: users.delete") });
    await expect(service.create(me, { name: 'Wreckers', description: '', permissions: ['users.delete'] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.permissionGroup.create).not.toHaveBeenCalled();
  });

  it('gives 409 for a name that differs only by case from an existing group', async () => {
    const { service, prisma } = setup({ allGroups: [{ id: 2, name: 'Administrators' }] });
    await expect(service.create(me, { name: 'ADMINISTRATORS', description: '', permissions: [] })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.permissionGroup.create).not.toHaveBeenCalled();
  });
});

describe('AdminGroupsService.update', () => {
  it('refuses to rename the system group with 400', async () => {
    const { service, prisma } = setup({ group: ADMIN_ROW });
    await expect(service.update(me, 2, { name: 'Owners' })).rejects.toThrow("The Administrators group can't be renamed");
    expect(prisma.permissionGroup.updateMany).not.toHaveBeenCalled();
  });

  it('lets the system group change its description', async () => {
    const { service, prisma } = setup({ group: ADMIN_ROW });
    await service.update(me, 2, { description: 'Everything' });
    expect(prisma.permissionGroup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2, updatedAt: new Date(1000) } }),
    );
  });

  it('writes nothing when nothing changes', async () => {
    const { service, prisma } = setup();
    await service.update(me, 3, { name: 'Moderators' });
    expect(prisma.permissionGroup.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an edit that lost a race with another edit (409)', async () => {
    const { service, prisma } = setup({ matches: 0, allGroups: [] });
    await expect(service.update(me, 3, { description: 'new' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
  });
});

describe('AdminGroupsService.setPermissions', () => {
  it('refuses to change the Administrators group, with the spec message', async () => {
    const { service, prisma } = setup({ group: ADMIN_ROW });
    await expect(service.setPermissions(me, 2, { permissions: [] })).rejects.toThrow(
      'The Administrators group always has every permission',
    );
    expect(prisma.groupPermission.createMany).not.toHaveBeenCalled();
  });

  it('checks only the permissions being added or removed, and reports the implied reads it added', async () => {
    const { service, permissions, prisma } = setup({ group: groupRow() }); // users.ban, users.read
    const result = await service.setPermissions(me, 3, { permissions: ['users.ban', 'users.edit'] });
    // users.edit is added (and its implied read users.read is already there); nothing is removed.
    expect(permissions.assertCanGrant).toHaveBeenCalledWith(1, ['users.edit']);
    expect(result.impliedAdded).toEqual([]);
    expect(prisma.groupPermission.createMany).toHaveBeenCalledWith({
      data: [
        { groupId: 3, permission: 'users.ban' },
        { groupId: 3, permission: 'users.edit' },
        { groupId: 3, permission: 'users.read' },
      ],
    });
  });

  it('adds an implied read the group did not have and says so', async () => {
    const { service, permissions } = setup({ group: groupRow({ permissions: [{ permission: 'users.ban' }] }) });
    const result = await service.setPermissions(me, 3, { permissions: ['users.ban', 'users.delete'] });
    expect(permissions.assertCanGrant).toHaveBeenCalledWith(1, ['users.delete', 'users.read']);
    expect(result.impliedAdded).toEqual(['users.read']);
  });

  it('refuses when the actor lacks a permission being removed (you cannot strip what you do not hold)', async () => {
    const { service, prisma } = setup({
      group: groupRow(),
      grant: new ForbiddenException("You can't grant permissions you don't have: users.ban"),
    });
    await expect(service.setPermissions(me, 3, { permissions: [] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.groupPermission.deleteMany).not.toHaveBeenCalled();
  });

  it('writes nothing for an unchanged set', async () => {
    const { service, prisma } = setup({ group: groupRow() });
    await service.setPermissions(me, 3, { permissions: ['users.ban', 'users.read'] });
    expect(prisma.groupPermission.deleteMany).not.toHaveBeenCalled();
  });
});

describe('AdminGroupsService.remove', () => {
  it('refuses to delete the system group with 400', async () => {
    const { service, prisma } = setup({ group: ADMIN_ROW });
    await expect(service.remove(me, 2)).rejects.toThrow("The Administrators group can't be deleted");
    expect(prisma.permissionGroup.deleteMany).not.toHaveBeenCalled();
  });

  it('checks every permission of the group, then deletes it and logs the member count', async () => {
    const { service, permissions, prisma } = setup({ group: groupRow() });
    await service.remove(me, 3);
    expect(permissions.assertCanGrant).toHaveBeenCalledWith(1, ['users.ban', 'users.read']);
    expect(prisma.permissionGroup.deleteMany).toHaveBeenCalledWith({ where: { id: 3, system: false } });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'group_delete', target: 'group:3', note: '{"name":"Moderators","members":2}' },
    });
  });

  it('gives 404 for an unknown group', async () => {
    const { service } = setup({ group: null });
    await expect(service.remove(me, 99)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminGroupsService membership', () => {
  it('adds a member, checking the grant and the act-on rules, and logs it', async () => {
    const { service, permissions, prisma } = setup();
    await expect(service.addMember(me, 3, 7)).resolves.toEqual({ id: 7, name: 'typist', bannedAt: null });
    expect(permissions.assertCanGrant).toHaveBeenCalledWith(1, ['users.ban', 'users.read']);
    expect(permissions.assertCanActOn).toHaveBeenCalledWith(1, 7);
    expect(prisma.userGroup.create).toHaveBeenCalledWith({ data: { userId: 7, groupId: 3 } });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'group_member_add', target: 'user:7', note: '{"group":3,"name":"Moderators"}' },
    });
  });

  it('is idempotent: an existing member gets no new row and no audit', async () => {
    const { service, prisma } = setup({ existingMembership: true });
    await service.addMember(me, 3, 7);
    expect(prisma.userGroup.create).not.toHaveBeenCalled();
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
  });

  it('refuses a suspended user with 400', async () => {
    const { service, prisma } = setup({ user: { id: 7, name: 'typist', bannedAt: new Date(0) } });
    await expect(service.addMember(me, 3, 7)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userGroup.create).not.toHaveBeenCalled();
  });

  it('refuses a target the actor cannot act on (403) before writing', async () => {
    const { service, prisma } = setup({ actOn: new ForbiddenException("You can't manage a user with permissions you don't have") });
    await expect(service.addMember(me, 3, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userGroup.create).not.toHaveBeenCalled();
  });

  it('removes a member and logs it; removing a non-member is a quiet no-op', async () => {
    const { service, prisma } = setup();
    await expect(service.removeMember(me, 3, 7)).resolves.toEqual({ ok: true });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'group_member_remove', target: 'user:7', note: '{"group":3,"name":"Moderators"}' },
    });

    const nothing = setup();
    nothing.prisma.userGroup.deleteMany.mockResolvedValueOnce({ count: 0 });
    await nothing.service.removeMember(me, 3, 7);
    expect(nothing.prisma.adminAction.create).not.toHaveBeenCalled();
  });

  it('refuses to remove the last Administrator (400), and removes one who is not the last', async () => {
    const last = setup({ group: ADMIN_ROW, adminMembers: [7], existingMembership: true });
    await expect(last.service.removeMember(me, 2, 7)).rejects.toThrow('Administrators needs at least one member');
    expect(last.prisma.userGroup.deleteMany).not.toHaveBeenCalled();

    const another = setup({ group: ADMIN_ROW, adminMembers: [7, 8], existingMembership: true });
    await expect(another.service.removeMember(me, 2, 7)).resolves.toEqual({ ok: true });
    expect(another.prisma.userGroup.deleteMany).toHaveBeenCalledWith({ where: { userId: 7, groupId: 2 } });
  });
});
