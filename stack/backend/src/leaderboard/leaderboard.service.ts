import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LeaderboardQuery } from '../results/results.schemas';

export const LEADERBOARD_SIZE = 50;
/** Extra users, tied with the last place, that the tie query may fetch. Caps the work for big ties. */
export const TIE_EXTRA_MAX = 200;

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

type Where = { mode: string; mode2: string; language: string };

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

/** Each user's first row (earliest createdAt, then lowest id). Used for the daily board. */
export function firstPerUser(rows: LeaderboardRow[]): LeaderboardRow[] {
  const first = new Map<number, LeaderboardRow>();
  for (const row of rows) {
    const cur = first.get(row.userId);
    if (!cur || isEarlier(row, cur)) first.set(row.userId, row);
  }
  return [...first.values()];
}

/** True when a ranks above b: higher wpm, then earlier createdAt, then lower id. */
function isBetter(a: LeaderboardRow, b: LeaderboardRow): boolean {
  if (a.wpm !== b.wpm) return a.wpm > b.wpm;
  return isEarlier(a, b);
}

/** True when a was saved before b (createdAt, then id). */
function isEarlier(a: LeaderboardRow, b: LeaderboardRow): boolean {
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta < tb;
  return a.id < b.id;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async top(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const where: Where = { mode: query.mode, mode2: query.mode2, language: query.language };
    if (query.mode === 'daily') return this.dailyTop(where);

    let best = await this.bestPerUser(where);
    if (best.length === LEADERBOARD_SIZE) {
      // Users tied with the last place must all be considered, or the earlier-date tie-break
      // could not decide between them. Capped at TIE_EXTRA_MAX extra users.
      const cutoff = best[best.length - 1].wpm;
      best = await this.bestPerUser(where, cutoff);
    }
    if (best.length === 0) return [];

    // Every candidate's rows at or above the lowest candidate best. Each user's best row is among them,
    // so picking the best per user in memory gives the right answer, with one query and no OR list.
    const lowest = best[best.length - 1].wpm;
    const ids = best.map((b) => b.userId);
    const [rows, users] = await Promise.all([
      this.prisma.result.findMany({
        where: { ...where, userId: { in: ids }, wpm: { gte: lowest } },
        select: { id: true, userId: true, wpm: true, rawWpm: true, accuracy: true, createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rankLeaderboard(rows.map((r) => ({ ...r, name: names.get(r.userId) ?? '' })));
  }

  /**
   * The daily board ranks each user by their first result for the date and language. Retries
   * are saved but do not change the rank. Every row for the day is read, since a user's first
   * result can rank below a later retry.
   */
  private async dailyTop(where: Where): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.result.findMany({
      where,
      select: {
        id: true,
        userId: true,
        wpm: true,
        rawWpm: true,
        accuracy: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    });
    const candidates = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.user.name,
      wpm: r.wpm,
      rawWpm: r.rawWpm,
      accuracy: r.accuracy,
      createdAt: r.createdAt,
    }));
    return rankLeaderboard(firstPerUser(candidates));
  }

  /**
   * Each user's best wpm for the filter, highest first. Without `minWpm`, the top
   * LEADERBOARD_SIZE users. With it, the users whose best is at least `minWpm`, capped at
   * LEADERBOARD_SIZE + TIE_EXTRA_MAX (ties are cut by userId).
   */
  private async bestPerUser(where: Where, minWpm?: number): Promise<Array<{ userId: number; wpm: number }>> {
    const groups =
      minWpm === undefined
        ? await this.prisma.result.groupBy({
            by: ['userId'],
            where,
            _max: { wpm: true },
            orderBy: [{ _max: { wpm: 'desc' } }, { userId: 'asc' }],
            take: LEADERBOARD_SIZE,
          })
        : await this.prisma.result.groupBy({
            by: ['userId'],
            where,
            _max: { wpm: true },
            orderBy: [{ _max: { wpm: 'desc' } }, { userId: 'asc' }],
            having: { wpm: { _max: { gte: minWpm } } },
            take: LEADERBOARD_SIZE + TIE_EXTRA_MAX,
          });
    return groups.flatMap((g) => (g._max.wpm === null ? [] : [{ userId: g.userId, wpm: g._max.wpm }]));
  }
}
