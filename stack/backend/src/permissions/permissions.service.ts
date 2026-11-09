import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Permission } from './catalog';
import { actOnProblem, grantMissing, resolveEffective } from './rules';

/** The Prisma client, or the transaction client inside $transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Effective permissions come from the database on every call (no cache across requests), so a change
 * to a group or a membership applies to the next request. The guard caches one result per request.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The union of the user's groups' permissions. Banned or unknown users get the empty set. */
  async effective(userId: number, db: Db = this.prisma): Promise<Set<Permission>> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        bannedAt: true,
        groups: {
          select: {
            group: {
              select: {
                name: true,
                system: true,
                permissions: { select: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user) return new Set();
    const groups = user.groups.map(({ group }) => ({
      name: group.name,
      system: group.system,
      permissions: group.permissions.map((row) => row.permission),
    }));
    return resolveEffective(groups, user.bannedAt !== null);
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
