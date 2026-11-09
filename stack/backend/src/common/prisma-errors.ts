import { Prisma } from '@prisma/client';

/** The Prisma error code (P2002 unique, P2025 not found, ...) of a known request error, or undefined. */
export function prismaCode(err: unknown): string | undefined {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
}
