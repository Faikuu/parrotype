import { USERNAME_REGEX } from '../auth/auth.schemas';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A suspended account is invisible here: its profile and badge are a plain 404, like an unknown name.
 * Case-insensitive lookup. A name that can't be a username is a 404 too.
 */
export async function findVisibleUser(
  prisma: PrismaService,
  name: string,
): Promise<{ id: number; name: string; createdAt: Date } | null> {
  if (!USERNAME_REGEX.test(name)) return null;
  return prisma.user.findFirst({
    where: { nameLower: name.toLowerCase(), bannedAt: null },
    select: { id: true, name: true, createdAt: true },
  });
}
