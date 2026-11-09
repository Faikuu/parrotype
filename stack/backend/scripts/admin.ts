/**
 * Admin CLI: grant, revoke and list admins. Run it through the wrapper, which loads .env the same way
 * scripts/prisma.mjs does and checks the generated client:
 *
 *   npm run admin -- grant <name>
 *   npm run admin -- revoke <name>
 *   npm run admin -- list
 *
 * There is no HTTP path to become an admin. Each grant or revoke writes an AdminAction with adminId null.
 */
import { PrismaClient } from '@prisma/client';
import { USERNAME_REGEX } from '../src/auth/auth.schemas';

const USAGE = 'Usage: npm run admin -- grant <name> | revoke <name> | list';

type Db = PrismaClient;

function findByName(prisma: Db, name: string) {
  if (!USERNAME_REGEX.test(name)) throw new Error(`"${name}" is not a valid username`);
  return prisma.user.findUnique({
    where: { nameLower: name.toLowerCase() },
    select: { id: true, name: true, role: true },
  });
}

/** Sets the role and logs it in one transaction. Returns the message for the terminal. */
export async function setRole(prisma: Db, name: string, role: 'admin' | 'user'): Promise<string> {
  const user = await findByName(prisma, name);
  if (!user) throw new Error(`No user named "${name}"`);

  const action = role === 'admin' ? 'grant_admin' : 'revoke_admin';
  if (user.role === role) {
    return role === 'admin' ? `${user.name} is already an admin` : `${user.name} is not an admin`;
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role } }),
    prisma.adminAction.create({ data: { adminId: null, action, target: `user:${user.id}`, note: 'cli' } }),
  ]);
  return role === 'admin' ? `Granted admin to ${user.name}` : `Revoked admin from ${user.name}`;
}

/** The admins, oldest account first. Suspended admins are marked. */
export async function listAdmins(prisma: Db): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: 'admin' },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, createdAt: true, bannedAt: true },
  });
  return admins.map(
    (a) => `${a.id}\t${a.name}\t${a.createdAt.toISOString()}${a.bannedAt ? '\tsuspended' : ''}`,
  );
}

async function main(argv: string[]): Promise<number> {
  const [command, name, ...extra] = argv;
  const valid =
    command === 'list' ? extra.length === 0 && name === undefined
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
    } else {
      console.log(await setRole(prisma, name, command === 'grant' ? 'admin' : 'user'));
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
