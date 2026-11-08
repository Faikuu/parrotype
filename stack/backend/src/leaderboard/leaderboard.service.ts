import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LeaderboardQuery } from '../results/results.schemas';

export const LEADERBOARD_SIZE = 50;

export interface LeaderboardEntry {
  rank: number;
  name: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  createdAt: string;
}

export interface LeaderboardRow {
  id: number;
  userId: number;
  name: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  createdAt: Date;
}

/** Each user's best row (highest wpm, earliest on a tie), sorted, top `limit`, with ranks. */
export function rankLeaderboard(rows: LeaderboardRow[], limit = LEADERBOARD_SIZE): LeaderboardEntry[] {
  const best = new Map<number, LeaderboardRow>();
  for (const row of rows) {
    const cur = best.get(row.userId);
    if (!cur || isBetter(row, cur)) best.set(row.userId, row);
  }
  return [...best.values()]
    .sort((a, b) => (isBetter(a, b) ? -1 : isBetter(b, a) ? 1 : 0))
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      wpm: r.wpm,
      rawWpm: r.rawWpm,
      accuracy: r.accuracy,
      createdAt: r.createdAt.toISOString(),
    }));
}

/** True when a ranks above b: higher wpm, then earlier createdAt, then lower id. */
function isBetter(a: LeaderboardRow, b: LeaderboardRow): boolean {
  if (a.wpm !== b.wpm) return a.wpm > b.wpm;
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta < tb;
  return a.id < b.id;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async top(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const where = { mode: query.mode, mode2: query.mode2, language: query.language };

    let best = await this.bestPerUser(where);
    if (best.length === LEADERBOARD_SIZE) {
      // Users tied with the last place must all be fetched, or the earlier-date tie-break
      // could not decide between them. Only this extra query is needed when the list is full.
      const cutoff = best[best.length - 1].wpm;
      best = await this.bestPerUser(where, cutoff);
    }
    if (best.length === 0) return [];

    // The earliest result at each user's best wpm, and the names, in one query each.
    const [rows, users] = await Promise.all([
      this.prisma.result.findMany({
        where: { ...where, OR: best.map((b) => ({ userId: b.userId, wpm: b.wpm })) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, userId: true, wpm: true, rawWpm: true, accuracy: true, createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: best.map((b) => b.userId) } },
        select: { id: true, name: true },
      }),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rankLeaderboard(rows.map((r) => ({ ...r, name: names.get(r.userId) ?? '' })));
  }

  /**
   * Each user's best wpm for the filter, highest first. Without `minWpm`, the top
   * LEADERBOARD_SIZE users. With it, every user whose best is at least `minWpm`.
   */
  private async bestPerUser(
    where: { mode: string; mode2: string; language: string },
    minWpm?: number,
  ): Promise<Array<{ userId: number; wpm: number }>> {
    const groups =
      minWpm === undefined
        ? await this.prisma.result.groupBy({
            by: ['userId'],
            where,
            _max: { wpm: true },
            orderBy: { _max: { wpm: 'desc' } },
            take: LEADERBOARD_SIZE,
          })
        : await this.prisma.result.groupBy({
            by: ['userId'],
            where,
            _max: { wpm: true },
            orderBy: { _max: { wpm: 'desc' } },
            having: { wpm: { _max: { gte: minWpm } } },
          });
    return groups.flatMap((g) => (g._max.wpm === null ? [] : [{ userId: g.userId, wpm: g._max.wpm }]));
  }
}
