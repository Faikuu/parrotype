import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { getEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { Permission } from './catalog';
import { actOnProblem, grantMissing, resolveEffective, type GroupFacts } from './rules';

/** The Prisma client, or the transaction client inside $transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;

/** An account with its groups, as the permission checks need it. */
export interface Account {
  id: number;
  name: string;
  tokenVersion: number;
  banned: boolean;
  groups: GroupFacts[];
}

/** One row per (account, group, permission). A group with no permission has a null `perm`; an account with no group, a null `gid`. */
interface AccountRow {
  uid: unknown;
  uname: string;
  utoken: unknown;
  ubanned: unknown;
  gid: unknown;
  gname: string | null;
  gsystem: unknown;
  perm: string | null;
}

/** Engines return booleans as true/false (PostgreSQL) or 0/1 (SQLite, MySQL). */
const flag = (value: unknown): boolean => value === true || Number(value) === 1;

/** Identifiers are quoted the way each engine expects; the table and column names are fixed in code. */
function ident(name: string): string {
  return getEnv().DATABASE_PROVIDER === 'mysql' ? `\`${name}\`` : `"${name}"`;
}

/**
 * Effective permissions come from the database on every call (no cache across requests), so a change to a
 * group or a membership applies to the next request.
 *
 * Two read paths, chosen by measurement. The guard loads the account, its groups and their permissions in one
 * raw statement (loadAccount), which is the same number of reads per request as the plain session check it
 * replaced. The service checks use Prisma's own reads: with the concurrent ban tests on SQLite, raw statements
 * made in the service checks stalled on the database lock, and nested Prisma reads did not.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The account with its groups and their stored permissions, or null when there is no such user. One raw
   * statement; used by PermissionsGuard only (see the class comment).
   */
  async loadAccount(userId: number, db: Db = this.prisma): Promise<Account | null> {
    const q = ident;
    const sql =
      `SELECT u.${q('id')} AS uid, u.${q('name')} AS uname, u.${q('tokenVersion')} AS utoken, ` +
      `(u.${q('bannedAt')} IS NOT NULL) AS ubanned, ` +
      `g.${q('id')} AS gid, g.${q('name')} AS gname, g.${q('system')} AS gsystem, gp.${q('permission')} AS perm ` +
      `FROM ${q('User')} u ` +
      `LEFT JOIN ${q('UserGroup')} ug ON ug.${q('userId')} = u.${q('id')} ` +
      `LEFT JOIN ${q('PermissionGroup')} g ON g.${q('id')} = ug.${q('groupId')} ` +
      `LEFT JOIN ${q('GroupPermission')} gp ON gp.${q('groupId')} = g.${q('id')} ` +
      `WHERE u.${q('id')} = `;
    const rows = await db.$queryRaw<AccountRow[]>(Prisma.sql`${Prisma.raw(sql)}${userId}`);
    if (rows.length === 0) return null;

    const groups = new Map<number, { name: string; system: boolean; permissions: string[] }>();
    for (const row of rows) {
      if (row.gid === null || row.gid === undefined) continue;
      const id = Number(row.gid);
      let group = groups.get(id);
      if (!group) {
        group = { name: row.gname ?? '', system: flag(row.gsystem), permissions: [] };
        groups.set(id, group);
      }
      if (row.perm !== null) group.permissions.push(row.perm);
    }
    const first = rows[0];
    return {
      id: Number(first.uid),
      name: first.uname,
      tokenVersion: Number(first.utoken),
      banned: flag(first.ubanned),
      groups: [...groups.values()],
    };
  }

  /** The union of the user's groups' permissions. Banned or unknown users get the empty set. */
  async effective(userId: number, db: Db = this.prisma): Promise<Set<Permission>> {
    const user = await db.user.findUnique({ where: { id: userId }, select: { bannedAt: true } });
    if (!user) return new Set();
    const groups = await db.permissionGroup.findMany({
      where: { members: { some: { userId } } },
      select: { name: true, system: true, permissions: { select: { permission: true } } },
    });
    return resolveEffective(
      groups.map((group) => ({
        name: group.name,
        system: group.system,
        permissions: group.permissions.map((row) => row.permission),
      })),
      user.bannedAt !== null,
    );
  }

  async has(userId: number, permission: Permission, db: Db = this.prisma): Promise<boolean> {
    return (await this.effective(userId, db)).has(permission);
  }

  /**
   * The actor may manage the target only when the target holds no permission the actor lacks. The
   * actor and the target may be the same user: that is always a subset. Endpoints that forbid acting on
   * yourself check that themselves.
   */
  async assertCanActOn(actorId: number, targetId: number, db: Db = this.prisma): Promise<void> {
    const actor = await this.effective(actorId, db);
    const target = await this.effective(targetId, db);
    const problem = actOnProblem(actor, target);
    if (problem) throw new ForbiddenException(problem);
  }

  /** The actor must hold every permission in the list. */
  async assertCanGrant(actorId: number, permissions: readonly Permission[], db: Db = this.prisma): Promise<void> {
    const missing = grantMissing(await this.effective(actorId, db), permissions);
    if (missing.length > 0) {
      throw new ForbiddenException(`You can't grant permissions you don't have: ${missing.join(', ')}`);
    }
  }
}
