import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { pageArgs, toPage, type Page, type PageQuery } from '../common/pagination';
import { prismaCode } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { lockAdministrators, remainsAdministrator } from '../permissions/administrators';
import type { Permission } from '../permissions/catalog';
import { PermissionsService } from '../permissions/permissions.service';
import {
  ADMINISTRATORS_ALL_PERMISSIONS,
  LAST_ADMINISTRATOR,
  isAdministrators,
  normalizePermissions,
  permissionsOfGroup,
  type GroupFacts,
} from '../permissions/rules';
import type { GroupCreateInput, GroupPermissionsInput, GroupUpdateInput } from './admin.schemas';

const NOT_FOUND_GROUP = 'No group with that id';
const NOT_FOUND_USER = 'No user with that id';
const NAME_TAKEN = 'A group with that name already exists';
const SYSTEM_RENAME = "The Administrators group can't be renamed";
const SYSTEM_DELETE = "The Administrators group can't be deleted";
const SUSPENDED_JOIN = "Suspended users can't be added to groups";
const CHANGED = 'The group changed while you were editing it. Reload and try again.';
/** Members listed on the group detail. */
export const GROUP_MEMBERS_SIZE = 100;

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  system: true,
  updatedAt: true,
  permissions: { select: { permission: true } },
  _count: { select: { members: true } },
} satisfies Prisma.PermissionGroupSelect;

type GroupRecord = Prisma.PermissionGroupGetPayload<{ select: typeof GROUP_SELECT }>;

export interface AdminGroup {
  id: number;
  name: string;
  description: string;
  system: boolean;
  /** Sorted catalog keys. Administrators lists every key. */
  permissions: Permission[];
  memberCount: number;
  updatedAt: string;
}

export interface GroupMember {
  id: number;
  name: string;
  bannedAt: string | null;
}

export interface AdminGroupDetail extends AdminGroup {
  members: GroupMember[];
}

/** A group write's response: the group, plus the implied read keys the server added to it. */
export interface GroupWriteResult extends AdminGroup {
  impliedAdded: Permission[];
}

function factsOf(group: GroupRecord): GroupFacts {
  return { name: group.name, system: group.system, permissions: group.permissions.map((p) => p.permission) };
}

export function toAdminGroup(group: GroupRecord): AdminGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    system: group.system,
    permissions: [...permissionsOfGroup(factsOf(group))].sort(),
    memberCount: group._count.members,
    updatedAt: group.updatedAt.toISOString(),
  };
}

/**
 * Permission groups and their membership. Every write checks the caller's permissions (assertCanGrant for
 * what changes, assertCanActOn for a member), the system group's immutability, and the last-Administrator
 * rule, then commits with its AdminAction row.
 */
@Injectable()
export class AdminGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(query: PageQuery): Promise<Page<AdminGroup>> {
    const [groups, total] = await Promise.all([
      this.prisma.permissionGroup.findMany({
        orderBy: { id: 'asc' },
        ...pageArgs(query),
        select: GROUP_SELECT,
      }),
      this.prisma.permissionGroup.count(),
    ]);
    return toPage(groups.map(toAdminGroup), total, query);
  }

  async detail(id: number): Promise<AdminGroupDetail> {
    const group = await this.findGroup(id);
    const members = await this.prisma.userGroup.findMany({
      where: { groupId: id },
      orderBy: { user: { nameLower: 'asc' } },
      take: GROUP_MEMBERS_SIZE,
      select: { user: { select: { id: true, name: true, bannedAt: true } } },
    });
    return {
      ...toAdminGroup(group),
      members: members.map(({ user }) => ({
        id: user.id,
        name: user.name,
        bannedAt: user.bannedAt?.toISOString() ?? null,
      })),
    };
  }

  async create(actor: AuthUser, input: GroupCreateInput): Promise<GroupWriteResult> {
    const { permissions, implied } = normalizePermissions(input.permissions);
    await this.permissions.assertCanGrant(actor.id, permissions);

    const group = await this.runWrite(() =>
      this.prisma.writeTx(async (tx) => {
        await this.assertNameFree(tx, input.name);
        const created = await tx.permissionGroup.create({
          data: {
            name: input.name,
            description: input.description,
            permissions: { create: permissions.map((permission) => ({ permission })) },
          },
          select: { id: true },
        });
        await tx.adminAction.create({
          data: {
            adminId: actor.id,
            action: 'group_create',
            target: `group:${created.id}`,
            note: JSON.stringify({ name: input.name, permissions }),
          },
        });
        return created;
      }),
    );
    const row = await this.findGroup(group.id);
    return { ...toAdminGroup(row), impliedAdded: implied };
  }

  async update(actor: AuthUser, id: number, input: GroupUpdateInput): Promise<AdminGroup> {
    const group = await this.findGroup(id);
    if (group.system && input.name !== undefined && input.name !== group.name) {
      throw new BadRequestException(SYSTEM_RENAME);
    }
    const changed: string[] = [];
    if (input.name !== undefined && input.name !== group.name) changed.push('name');
    if (input.description !== undefined && input.description !== group.description) changed.push('description');
    if (changed.length === 0) return toAdminGroup(group);

    await this.runWrite(() =>
      this.prisma.writeTx(async (tx) => {
        if (changed.includes('name')) await this.assertNameFree(tx, input.name!, id);
        const data: Prisma.PermissionGroupUpdateManyMutationInput = { updatedAt: new Date() };
        if (changed.includes('name')) data.name = input.name;
        if (changed.includes('description')) data.description = input.description;
        // Conditional on the state read above: a concurrent edit wins and this one is refused.
        const { count } = await tx.permissionGroup.updateMany({ where: { id, updatedAt: group.updatedAt }, data });
        if (count === 0) throw new ConflictException(CHANGED);
        await tx.adminAction.create({
          data: { adminId: actor.id, action: 'group_update', target: `group:${id}`, note: JSON.stringify({ changed }) },
        });
      }),
    );
    return toAdminGroup(await this.findGroup(id));
  }

  /**
   * Replaces the group's permissions. The actor must hold every permission being added or removed.
   * Implied read keys are added, and the response lists the ones this change added.
   */
  async setPermissions(actor: AuthUser, id: number, input: GroupPermissionsInput): Promise<GroupWriteResult> {
    const group = await this.findGroup(id);
    if (group.system) throw new BadRequestException(ADMINISTRATORS_ALL_PERMISSIONS);

    const { permissions: wanted, implied } = normalizePermissions(input.permissions);
    const current = new Set(permissionsOfGroup(factsOf(group)));
    const wantedSet = new Set<Permission>(wanted);
    const added = wanted.filter((p) => !current.has(p));
    const removed = [...current].filter((p) => !wantedSet.has(p)).sort();
    const impliedAdded = implied.filter((p) => added.includes(p));
    if (added.length === 0 && removed.length === 0) return { ...toAdminGroup(group), impliedAdded: [] };

    await this.permissions.assertCanGrant(actor.id, [...added, ...removed]);

    await this.runWrite(() =>
      this.prisma.writeTx(async (tx) => {
        const { count } = await tx.permissionGroup.updateMany({
          where: { id, updatedAt: group.updatedAt },
          data: { updatedAt: new Date() },
        });
        if (count === 0) throw new ConflictException(CHANGED);
        await tx.groupPermission.deleteMany({ where: { groupId: id } });
        await tx.groupPermission.createMany({ data: wanted.map((permission) => ({ groupId: id, permission })) });
        await tx.adminAction.create({
          data: {
            adminId: actor.id,
            action: 'group_permissions',
            target: `group:${id}`,
            note: JSON.stringify({ added, removed }),
          },
        });
      }),
    );
    return { ...toAdminGroup(await this.findGroup(id)), impliedAdded };
  }

  /** Deletes a non-system group. Its memberships go with it. The actor must hold every permission of the group. */
  async remove(actor: AuthUser, id: number): Promise<{ ok: true }> {
    const group = await this.findGroup(id);
    if (group.system) throw new BadRequestException(SYSTEM_DELETE);
    await this.permissions.assertCanGrant(actor.id, [...permissionsOfGroup(factsOf(group))]);

    await this.prisma.writeTx(async (tx) => {
      const { count } = await tx.permissionGroup.deleteMany({ where: { id, system: false } });
      if (count === 0) throw new NotFoundException(NOT_FOUND_GROUP);
      await tx.adminAction.create({
        data: {
          adminId: actor.id,
          action: 'group_delete',
          target: `group:${id}`,
          note: JSON.stringify({ name: group.name, members: group._count.members }),
        },
      });
    });
    return { ok: true };
  }

  /**
   * Adds a user to a group. Idempotent: a user who is already a member gets 200 and no new audit row. The
   * actor must hold every permission of the group and be able to act on the user; a suspended user can't join.
   */
  async addMember(actor: AuthUser, groupId: number, userId: number): Promise<GroupMember> {
    const group = await this.findGroup(groupId);
    const user = await this.findUser(userId);
    if (user.bannedAt) throw new BadRequestException(SUSPENDED_JOIN);
    await this.permissions.assertCanGrant(actor.id, [...permissionsOfGroup(factsOf(group))]);
    await this.permissions.assertCanActOn(actor.id, userId);

    try {
      await this.prisma.writeTx(async (tx) => {
        const existing = await tx.userGroup.findUnique({ where: { userId_groupId: { userId, groupId } }, select: { userId: true } });
        if (existing) return;
        await tx.userGroup.create({ data: { userId, groupId } });
        await tx.adminAction.create({
          data: {
            adminId: actor.id,
            action: 'group_member_add',
            target: `user:${userId}`,
            note: JSON.stringify({ group: groupId, name: group.name }),
          },
        });
      });
    } catch (err) {
      // Another request added the same membership first: the loser's transaction rolled back, the result stands.
      if (prismaCode(err) !== 'P2002') throw err;
    }
    return { id: user.id, name: user.name, bannedAt: null };
  }

  /**
   * Removes a user from a group. Idempotent. Removing the last Administrator is refused, and removing
   * yourself is allowed except for that rule.
   */
  async removeMember(actor: AuthUser, groupId: number, userId: number): Promise<{ ok: true }> {
    const group = await this.findGroup(groupId);
    await this.findUser(userId);
    await this.permissions.assertCanGrant(actor.id, [...permissionsOfGroup(factsOf(group))]);
    await this.permissions.assertCanActOn(actor.id, userId);

    await this.prisma.writeTx(async (tx) => {
      if (isAdministrators(group)) {
        await lockAdministrators(tx, groupId);
        const member = await tx.userGroup.findUnique({ where: { userId_groupId: { userId, groupId } }, select: { userId: true } });
        if (member && !(await remainsAdministrator(tx, groupId, [userId]))) {
          throw new BadRequestException(LAST_ADMINISTRATOR);
        }
      }
      const { count } = await tx.userGroup.deleteMany({ where: { userId, groupId } });
      if (count === 0) return;
      await tx.adminAction.create({
        data: {
          adminId: actor.id,
          action: 'group_member_remove',
          target: `user:${userId}`,
          note: JSON.stringify({ group: groupId, name: group.name }),
        },
      });
    });
    return { ok: true };
  }

  /** Group names are unique without regard to case. The list is short, so the check reads them all. */
  private async assertNameFree(tx: Prisma.TransactionClient, name: string, exceptId?: number): Promise<void> {
    const wanted = name.toLowerCase();
    const groups = await tx.permissionGroup.findMany({ select: { id: true, name: true } });
    if (groups.some((g) => g.id !== exceptId && g.name.toLowerCase() === wanted)) {
      throw new ConflictException(NAME_TAKEN);
    }
  }

  /** Maps a unique-name race (P2002 from the database) to the same 409 as the check. */
  private async runWrite<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (prismaCode(err) === 'P2002') throw new ConflictException(NAME_TAKEN);
      throw err;
    }
  }

  private async findGroup(id: number): Promise<GroupRecord> {
    const group = await this.prisma.permissionGroup.findUnique({ where: { id }, select: GROUP_SELECT });
    if (!group) throw new NotFoundException(NOT_FOUND_GROUP);
    return group;
  }

  private async findUser(id: number): Promise<{ id: number; name: string; bannedAt: Date | null }> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, bannedAt: true } });
    if (!user) throw new NotFoundException(NOT_FOUND_USER);
    return user;
  }
}
