import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SESSION_COOKIE } from '../src/auth/auth.service';

/** Makes the account an Administrator through the system group, as scripts/admin.ts grant does. */
export async function makeAdministrator(prisma: PrismaService, nameLower: string): Promise<void> {
  const group = await prisma.permissionGroup.findUniqueOrThrow({ where: { name: 'Administrators' }, select: { id: true } });
  const user = await prisma.user.findUniqueOrThrow({ where: { nameLower }, select: { id: true } });
  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: user.id, groupId: group.id } },
    create: { userId: user.id, groupId: group.id },
    update: {},
  });
}

/**
 * A session cookie for an existing account, signed the way the login does (same secret, same tokenVersion).
 * Used where a test needs many accounts: registration and login are throttled to 10 a minute.
 */
export async function sessionFor(app: INestApplication, prisma: PrismaService, nameLower: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { nameLower },
    select: { id: true, name: true, tokenVersion: true },
  });
  const token = await app.get(JwtService).signAsync({ sub: user.id, name: user.name, v: user.tokenVersion });
  return `${SESSION_COOKIE}=${token}`;
}

/** Removes the account from Administrators. The account keeps its other groups. */
export async function revokeAdministrator(prisma: PrismaService, nameLower: string): Promise<void> {
  await prisma.userGroup.deleteMany({
    where: { user: { nameLower }, group: { name: 'Administrators' } },
  });
}
