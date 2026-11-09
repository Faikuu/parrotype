import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { USERNAME_REGEX } from '../auth/auth.schemas';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { UserEvents } from '../common/user-events';
import { pageArgs, toPage, type Page } from '../common/pagination';
import { prismaCode } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { ADMINISTRATORS_GROUP, LAST_ADMINISTRATOR, isAdministrators, permissionsOfGroup, type GroupFacts } from '../permissions/rules';
import { PermissionsService } from '../permissions/permissions.service';
import { administratorsGroupId, lockAdministrators, remainsAdministrator } from '../permissions/administrators';
import type { Permission } from '../permissions/catalog';
import type { UserDeleteInput, UserGroupsInput, UserListQuery } from './admin.schemas';

export const NOT_FOUND_USER = 'No user with that name';
const NOT_FOUND_USER_ID = 'No user with that id';
const TAKEN_NAME = 'Username or email is already taken';
const SELF_BAN = "You can't suspend your own account";
const SELF_DELETE = "You can't delete your own account from the admin panel";
const ADMIN_BAN = "Administrators can't be banned";
const SUSPENDED_JOIN = "Suspended users can't be added to groups";
const GROUPS_CHANGED = 'The groups changed while you were editing them. Reload and try again.';
const RECENT_SIZE = 10;

/** The list and detail row select. The password, token version and email of nobody else are never read. */
const ROW_SELECT = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  bannedAt: true,
  groups: { select: { group: { select: { id: true, name: true } } } },
  _count: { select: { results: true } },
} satisfies Prisma.UserSelect;

const RESULT_SELECT = {
  id: true,
  mode: true,
  mode2: true,
  language: true,
  wpm: true,
  rawWpm: true,
  accuracy: true,
  consistency: true,
  durationMs: true,
  createdAt: true,
} satisfies Prisma.ResultSelect;

const REPORT_SELECT = {
  id: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  reporter: { select: { id: true, name: true } },
  target: { select: { id: true, name: true } },
} satisfies Prisma.ReportSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof ROW_SELECT }>;

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  bannedAt: string | null;
  groups: Array<{ id: number; name: string }>;
  resultCount: number;
}

export interface AdminUserDetail extends AdminUserRow {
  banReason: string | null;
  effectivePermissions: Permission[];
  /** What the user's groups grant, ignoring a suspension: the rank used for who may manage them. */
  heldPermissions: Permission[];
  stats: { tests: number; bestWpm: number | null; lastResultAt: string | null };
  recentResults: Array<{
    id: number;
    mode: string;
    mode2: string;
    language: string;
    wpm: number;
    rawWpm: number;
    accuracy: number;
    consistency: number;
    durationMs: number;
    createdAt: string;
  }>;
  reportsReceived: AdminReportRef[];
  reportsMade: AdminReportRef[];
}

export interface AdminReportRef {
  id: number;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  reporter: { id: number; name: string };
  target: { id: number; name: string };
}

export function toUserRow(user: UserRecord): AdminUserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    bannedAt: user.bannedAt?.toISOString() ?? null,
    groups: user.groups
      .map(({ group }) => ({ id: group.id, name: group.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    resultCount: user._count.results,
  };
}

/** The stored permission keys of a group, for the rules (Administrators is read as the full catalog). */
function factsOf(group: { name: string; system: boolean; permissions: Array<{ permission: string }> }): GroupFacts {
  return { name: group.name, system: group.system, permissions: group.permissions.map((p) => p.permission) };
}

const GROUP_FACTS_SELECT = {
  id: true,
  name: true,
  system: true,
  permissions: { select: { permission: true } },
} satisfies Prisma.PermissionGroupSelect;

/**
 * The user admin operations. Every write checks the caller's permission first (the guard), then the
 * safety rules: assertCanActOn for the target, assertCanGrant for every group or permission that changes,
 * not-yourself where the spec says so, and the last-Administrator rule. Each write and its AdminAction
 * row commit together. Conditional writes make a race produce one winner.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly userEvents: UserEvents,
  ) {}

  async list(query: UserListQuery): Promise<Page<AdminUserRow>> {
    const q = query.q?.toLowerCase();
    const where: Prisma.UserWhereInput = {
      ...(q ? { OR: [{ nameLower: { contains: q } }, { email: { contains: q } }] } : {}),
      ...(query.banned === 'true' ? { bannedAt: { not: null } } : {}),
      ...(query.banned === 'false' ? { bannedAt: null } : {}),
      ...(query.group ? { groups: { some: { groupId: query.group } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: this.orderFor(query),
        ...pageArgs(query),
        select: ROW_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(rows.map(toUserRow), total, query);
  }

  private orderFor(query: UserListQuery): Prisma.UserOrderByWithRelationInput[] {
    switch (query.sort) {
      case 'name':
        return [{ nameLower: query.order ?? 'asc' }, { id: 'asc' }];
      case 'results':
        return [{ results: { _count: query.order ?? 'desc' } }, { id: 'asc' }];
      case 'created':
        return [{ createdAt: query.order ?? 'desc' }, { id: 'desc' }];
    }
  }

  async detail(id: number): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...ROW_SELECT, banReason: true },
    });
    if (!user) throw new NotFoundException(NOT_FOUND_USER_ID);

    const [totals, last, recent, received, made, effective, held] = await Promise.all([
      this.prisma.result.aggregate({
        where: { userId: id },
        _count: { _all: true },
        _max: { wpm: true },
      }),
      this.prisma.result.findFirst({
        where: { userId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
      this.prisma.result.findMany({
        where: { userId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_SIZE,
        select: RESULT_SELECT,
      }),
      this.prisma.report.findMany({
        where: { targetId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_SIZE,
        select: REPORT_SELECT,
      }),
      this.prisma.report.findMany({
        where: { reporterId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_SIZE,
        select: REPORT_SELECT,
      }),
      this.permissions.effective(id),
      this.permissions.held(id),
    ]);

    return {
      ...toUserRow(user),
      banReason: user.banReason,
      effectivePermissions: [...effective].sort(),
      heldPermissions: [...held].sort(),
      stats: {
        tests: totals._count._all,
        bestWpm: totals._max.wpm ?? null,
        lastResultAt: last?.createdAt.toISOString() ?? null,
      },
      recentResults: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      reportsReceived: received.map(toReportRef),
      reportsMade: made.map(toReportRef),
    };
  }

  /** Renames a user. The JWT carries the name, so the tokenVersion bump ends every session of theirs. */
  async rename(actor: AuthUser, id: number, name: string): Promise<AdminUserRow> {
    const target = await this.findUser(id);
    await this.permissions.assertCanActOn(actor.id, id);
    if (target.name === name) return this.rowOf(id);

    const nameLower = name.toLowerCase();
    await this.prisma.writeTx(async (tx) => {
      const clash = await tx.user.findFirst({ where: { nameLower, NOT: { id } }, select: { id: true } });
      if (clash) throw new ConflictException(TAKEN_NAME);
      try {
        await tx.user.update({
          where: { id },
          data: { name, nameLower, tokenVersion: { increment: 1 } },
        });
      } catch (err) {
        if (prismaCode(err) === 'P2002') throw new ConflictException(TAKEN_NAME);
        if (prismaCode(err) === 'P2025') throw new NotFoundException(NOT_FOUND_USER_ID);
        throw err;
      }
      await tx.adminAction.create({
        data: {
          adminId: actor.id,
          action: 'user_rename',
          target: `user:${id}`,
          note: JSON.stringify({ from: target.name, to: name }),
        },
      });
    });
    return this.rowOf(id);
  }

  /** Bumps tokenVersion: every session of the user ends. Allowed on yourself (it signs you out). */
  async revokeSessions(actor: AuthUser, id: number): Promise<{ ok: true }> {
    await this.findUser(id);
    await this.permissions.assertCanActOn(actor.id, id);
    await this.prisma.writeTx(async (tx) => {
      await this.bumpOrThrow(tx, id);
      await tx.adminAction.create({
        data: { adminId: actor.id, action: 'user_revoke_sessions', target: `user:${id}` },
      });
    });
    return { ok: true };
  }

  /**
   * Suspends a user: bumps tokenVersion so their sessions end now, and emits the 'banned' event so open
   * race sockets close. Administrators can't be suspended. The write matches only a user who is not
   * suspended and not an Administrator; on a miss, a re-read names the reason.
   */
  async ban(actor: AuthUser, id: number, reason: string): Promise<AdminUserRow> {
    if (id === actor.id) throw new BadRequestException(SELF_BAN);
    await this.findUser(id);
    await this.permissions.assertCanActOn(actor.id, id);
    await this.prisma.writeTx(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id, bannedAt: null, groups: { none: { group: { name: ADMINISTRATORS_GROUP, system: true } } } },
        data: { bannedAt: new Date(), banReason: reason, tokenVersion: { increment: 1 } },
      });
      if (count === 0) await this.explainBanMiss(tx, id);
      await tx.adminAction.create({
        data: { adminId: actor.id, action: 'ban', target: `user:${id}`, note: reason },
      });
    });
    this.userEvents.banned(id);
    return this.rowOf(id);
  }

  async unban(actor: AuthUser, id: number): Promise<AdminUserRow> {
    if (id === actor.id) throw new BadRequestException("You can't unsuspend your own account");
    await this.findUser(id);
    await this.permissions.assertCanActOn(actor.id, id);
    await this.prisma.writeTx(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id, bannedAt: { not: null } },
        data: { bannedAt: null, banReason: null },
      });
      if (count === 0) throw new ConflictException('User is not suspended');
      await tx.adminAction.create({
        data: { adminId: actor.id, action: 'unban', target: `user:${id}` },
      });
    });
    return this.rowOf(id);
  }

  /** The 2.3 name-based routes, kept as aliases. The name must resolve to exactly one user. */
  async idForName(name: string): Promise<number> {
    if (!USERNAME_REGEX.test(name)) throw new NotFoundException(NOT_FOUND_USER);
    const user = await this.prisma.user.findUnique({ where: { nameLower: name.toLowerCase() }, select: { id: true } });
    if (!user) throw new NotFoundException(NOT_FOUND_USER);
    return user.id;
  }

  /**
   * Replaces the user's groups. Each added or removed group must be one the actor can grant, and the
   * target must be one the actor can act on. Removing the last Administrator is refused.
   */
  async setGroups(actor: AuthUser, id: number, input: UserGroupsInput): Promise<AdminUserRow> {
    const target = await this.findUser(id);
    const wanted = [...new Set(input.groupIds)];

    const current = (await this.prisma.userGroup.findMany({ where: { userId: id }, select: { groupId: true } })).map(
      (m) => m.groupId,
    );
    const relevant = [...new Set([...wanted, ...current])];
    const rows = relevant.length
      ? await this.prisma.permissionGroup.findMany({ where: { id: { in: relevant } }, select: GROUP_FACTS_SELECT })
      : [];
    const byId = new Map(rows.map((g) => [g.id, g]));
    const unknown = wanted.filter((g) => !byId.has(g));
    if (unknown.length > 0) throw new BadRequestException(`Unknown group id: ${unknown.join(', ')}`);

    const currentSet = new Set(current);
    const wantedSet = new Set(wanted);
    const added = wanted.filter((g) => !currentSet.has(g));
    const removed = current.filter((g) => !wantedSet.has(g));
    if (added.length === 0 && removed.length === 0) return this.rowOf(id);
    if (added.length > 0 && target.bannedAt) throw new BadRequestException(SUSPENDED_JOIN);

    await this.permissions.assertCanActOn(actor.id, id);
    const needed = new Set<Permission>();
    for (const groupId of [...added, ...removed]) {
      for (const p of permissionsOfGroup(factsOf(byId.get(groupId)!))) needed.add(p);
    }
    await this.permissions.assertCanGrant(actor.id, [...needed]);

    const adminGroup = await this.prisma.permissionGroup.findFirst({
      where: { name: ADMINISTRATORS_GROUP, system: true },
      select: { id: true },
    });
    const removingAdmin = adminGroup !== null && removed.includes(adminGroup.id);

    try {
      await this.prisma.writeTx(async (tx) => {
        if (removingAdmin) {
          await lockAdministrators(tx, adminGroup!.id);
          if (!(await remainsAdministrator(tx, adminGroup!.id, [id]))) throw new BadRequestException(LAST_ADMINISTRATOR);
        }
        if (removed.length > 0) {
          await tx.userGroup.deleteMany({ where: { userId: id, groupId: { in: removed } } });
        }
        if (added.length > 0) {
          await tx.userGroup.createMany({ data: added.map((groupId) => ({ userId: id, groupId })) });
        }
        await tx.adminAction.create({
          data: {
            adminId: actor.id,
            action: 'user_groups',
            target: `user:${id}`,
            note: JSON.stringify({ added, removed }),
          },
        });
      });
    } catch (err) {
      if (prismaCode(err) === 'P2002' || prismaCode(err) === 'P2003') throw new ConflictException(GROUPS_CHANGED);
      throw err;
    }
    return this.rowOf(id);
  }

  /**
   * Deletes the account. The caller types the username to confirm. Results and reports go with it
   * (cascade). Open race sockets of the user close, through the 'banned' event.
   */
  async remove(actor: AuthUser, id: number, input: UserDeleteInput): Promise<{ ok: true }> {
    if (id === actor.id) throw new BadRequestException(SELF_DELETE);
    const target = await this.findUser(id);
    if (input.confirm !== target.name) throw new BadRequestException('Type the username exactly to confirm the deletion');
    await this.permissions.assertCanActOn(actor.id, id);

    await this.prisma.writeTx(async (tx) => {
      const adminGroup = await administratorsGroupId(tx);
      if (adminGroup !== null) {
        await lockAdministrators(tx, adminGroup);
        const member = await tx.userGroup.findUnique({ where: { userId_groupId: { userId: id, groupId: adminGroup } } });
        if (member && !(await remainsAdministrator(tx, adminGroup, [id]))) throw new BadRequestException(LAST_ADMINISTRATOR);
      }
      try {
        await tx.user.delete({ where: { id } });
      } catch (err) {
        if (prismaCode(err) === 'P2025') throw new NotFoundException(NOT_FOUND_USER_ID);
        throw err;
      }
      await tx.adminAction.create({
        data: { adminId: actor.id, action: 'user_delete', target: `user:${id}`, note: JSON.stringify({ name: target.name }) },
      });
    });
    this.userEvents.banned(id);
    return { ok: true };
  }

  /** Throws the error that explains a ban write which matched nothing. */
  private async explainBanMiss(tx: Prisma.TransactionClient, userId: number): Promise<never> {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { groups: { select: { group: { select: { name: true, system: true } } } } },
    });
    if (!current) throw new NotFoundException(NOT_FOUND_USER_ID);
    if (current.groups.some(({ group }) => isAdministrators(group))) throw new BadRequestException(ADMIN_BAN);
    throw new ConflictException('User is already suspended');
  }

  private async bumpOrThrow(tx: Prisma.TransactionClient, id: number): Promise<void> {
    try {
      await tx.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
    } catch (err) {
      if (prismaCode(err) === 'P2025') throw new NotFoundException(NOT_FOUND_USER_ID);
      throw err;
    }
  }

  private async findUser(id: number): Promise<{ id: number; name: string; bannedAt: Date | null }> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, bannedAt: true } });
    if (!user) throw new NotFoundException(NOT_FOUND_USER_ID);
    return user;
  }

  private async rowOf(id: number): Promise<AdminUserRow> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: ROW_SELECT });
    if (!user) throw new NotFoundException(NOT_FOUND_USER_ID);
    return toUserRow(user);
  }
}

function toReportRef(report: Prisma.ReportGetPayload<{ select: typeof REPORT_SELECT }>): AdminReportRef {
  return { ...report, createdAt: report.createdAt.toISOString() };
}
