import type { Prisma } from '@prisma/client';
import { ADMINISTRATORS_GROUP, keepsAnAdministrator } from './rules';

/**
 * Serialises membership changes of the Administrators group. Callers run this first, inside their
 * transaction: the update takes the group's row lock until commit (sqlite serialises writes anyway), so
 * two removals cannot both see two members and leave none.
 */
export async function lockAdministrators(tx: Prisma.TransactionClient, groupId: number): Promise<void> {
  await tx.permissionGroup.updateMany({ where: { id: groupId }, data: { updatedAt: new Date() } });
}

/**
 * The last-Administrator rule, read after lockAdministrators. True when at least one member would remain
 * once `removedIds` leave the group.
 */
export async function remainsAdministrator(
  tx: Prisma.TransactionClient,
  groupId: number,
  removedIds: readonly number[],
): Promise<boolean> {
  const members = await tx.userGroup.findMany({ where: { groupId }, select: { userId: true } });
  return keepsAnAdministrator(
    members.map((m) => m.userId),
    removedIds,
  );
}

/** The id of the system Administrators group, or null before the migration has run. */
export async function administratorsGroupId(tx: Prisma.TransactionClient): Promise<number | null> {
  const group = await tx.permissionGroup.findFirst({
    where: { name: ADMINISTRATORS_GROUP, system: true },
    select: { id: true },
  });
  return group?.id ?? null;
}
