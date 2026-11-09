import type { Prisma } from '@prisma/client';

/** The fields of a result the suspicious rule reads. */
export interface SuspiciousFacts {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
}

/**
 * The admin panel's suspicious rule (docs/SPEC-2.4.md): a very fast result with uneven pace, a wpm above
 * the raw wpm (the typed characters can't be faster than all the keystrokes), or a fast result with low
 * accuracy. The Prisma filter below is built from the same three clauses.
 */
export function isSuspicious(r: SuspiciousFacts): boolean {
  return (r.wpm >= 180 && r.consistency < 40) || r.wpm > r.rawWpm || (r.accuracy < 75 && r.wpm >= 150);
}

/**
 * The rule as a Prisma `where`, so the database filters the page. Prisma can't compare two columns, so the
 * `wpm > rawWpm` clause takes the ids the database found for it (see AdminService.cheatResultIds).
 */
export function suspiciousWhere(rawWpmIds: readonly number[]): Prisma.ResultWhereInput {
  return {
    OR: [
      { wpm: { gte: 180 }, consistency: { lt: 40 } },
      { wpm: { gte: 150 }, accuracy: { lt: 75 } },
      { id: { in: [...rawWpmIds] } },
    ],
  };
}
