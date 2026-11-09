/**
 * Admin CLI: grant and revoke Administrators, list them, and list the groups. Run it through the wrapper,
 * which loads .env the same way scripts/prisma.mjs does and checks the generated client:
 *
 *   npm run admin -- grant <name>     adds the user to the Administrators group
 *   npm run admin -- revoke <name>    removes the user from Administrators (refused for the last member)
 *   npm run admin -- list             lists the Administrators
 *   npm run admin -- groups           lists every group with its member and permission counts
 *
 * There is no HTTP path to become an admin. Each grant or revoke writes an AdminAction with adminId null.
 */
import { PrismaClient } from '@prisma/client';
import { USERNAME_REGEX } from '../src/auth/auth.schemas';
import { lockAdministrators, remainsAdministrator } from '../src/permissions/administrators';
import { ADMINISTRATORS_GROUP, LAST_ADMINISTRATOR, permissionsOfGroup } from '../src/permissions/rules';

const USAGE = 'Usage: npm run admin -- grant <name> | revoke <name> | list | groups';

type Db = PrismaClient;

async function findByName(prisma: Db, name: string) {
  if (!USERNAME_REGEX.test(name)) throw new Error(`"${name}" is not a valid username`);
  const user = await prisma.user.findUnique({ where: { nameLower: name.toLowerCase() }, select: { id: true, name: true } });
  if (!user) throw new Error(`No user named "${name}"`);
  return user;
}

/** The system Administrators group. It exists once the migrations have run. */
async function administratorsGroup(prisma: Db): Promise<{ id: number }> {
  const group = await prisma.permissionGroup.findFirst({
    where: { name: ADMINISTRATORS_GROUP, system: true },
    select: { id: true },
  });
  if (!group) throw new Error('The Administrators group is missing. Run `npm run prisma:deploy` first.');
  return group;
}

/** Adds or removes the user's Administrators membership and logs it in the same transaction. Returns the terminal message. */
export async function setAdmin(prisma: Db, name: string, grant: boolean): Promise<string> {
  const user = await findByName(prisma, name);
  const group = await administratorsGroup(prisma);
  const member = await prisma.userGroup.findUnique({
    where: { userId_groupId: { userId: user.id, groupId: group.id } },
    select: { userId: true },
  });
  const note = JSON.stringify({ group: group.id, name: ADMINISTRATORS_GROUP, via: 'cli' });

  if (grant) {
    if (member) return `${user.name} is already an admin`;
    await prisma.$transaction(async (tx) => {
      await tx.userGroup.create({ data: { userId: user.id, groupId: group.id } });
      await tx.adminAction.create({
        data: { adminId: null, action: 'group_member_add', target: `user:${user.id}`, note },
      });
    });
    return `Granted admin to ${user.name}`;
  }

  if (!member) return `${user.name} is not an admin`;
  await prisma.$transaction(async (tx) => {
    await lockAdministrators(tx, group.id);
    if (!(await remainsAdministrator(tx, group.id, [user.id]))) throw new Error(LAST_ADMINISTRATOR);
    await tx.userGroup.deleteMany({ where: { userId: user.id, groupId: group.id } });
    await tx.adminAction.create({
      data: { adminId: null, action: 'group_member_remove', target: `user:${user.id}`, note },
    });
  });
  return `Revoked admin from ${user.name}`;
}

/** The Administrators, oldest account first. Suspended admins are marked. */
export async function listAdmins(prisma: Db): Promise<string[]> {
  const group = await administratorsGroup(prisma);
  const members = await prisma.userGroup.findMany({
    where: { groupId: group.id },
    orderBy: { userId: 'asc' },
    select: { user: { select: { id: true, name: true, createdAt: true, bannedAt: true } } },
  });
  return members.map(({ user }) => `${user.id}\t${user.name}\t${user.createdAt.toISOString()}${user.bannedAt ? '\tsuspended' : ''}`);
}

/** Every group: id, name, system or custom, member count and permission count. */
export async function listGroups(prisma: Db): Promise<string[]> {
  const groups = await prisma.permissionGroup.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      system: true,
      permissions: { select: { permission: true } },
      _count: { select: { members: true } },
    },
  });
  return groups.map((g) => {
    const permissions = permissionsOfGroup({
      name: g.name,
      system: g.system,
      permissions: g.permissions.map((p) => p.permission),
    }).size;
    return `${g.id}\t${g.name}\t${g.system ? 'system' : 'custom'}\t${g._count.members} members\t${permissions} permissions`;
  });
}

async function main(argv: string[]): Promise<number> {
  const [command, name, ...extra] = argv;
  const valid =
    command === 'list' || command === 'groups' ? extra.length === 0 && name === undefined
    : command === 'grant' || command === 'revoke' ? name !== undefined && extra.length === 0
    : false;
  if (!valid) {
    console.error(USAGE);
    return 2;
  }

  const prisma = new PrismaClient();
  try {
    if (command === 'list') {
      const lines = await listAdmins(prisma);
      console.log(lines.length ? lines.join('\n') : 'No admins.');
    } else if (command === 'groups') {
      const lines = await listGroups(prisma);
      console.log(lines.length ? lines.join('\n') : 'No groups.');
    } else {
      console.log(await setAdmin(prisma, name, command === 'grant'));
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
