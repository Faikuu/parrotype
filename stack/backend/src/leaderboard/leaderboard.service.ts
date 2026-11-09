import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  /** Whether the result's replay was checked. The replay is at GET /api/results/:resultId/replay. */
  verified: boolean;
  resultId: number;
}

export interface LeaderboardRow {
  id: number;
  userId: number;
  name: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  createdAt: Date;
  verified: boolean;
}

/** The filter of one board. Banned users and users with an unverified email never appear: see userVisible. */
type Where = Prisma.ResultWhereInput;

/** What the board is for: a ranked mode, a date, and optionally the viewer's friends and verified results only. */
export interface LeaderboardInput {
  mode: LeaderboardQuery['mode'];
  mode2: string;
  language: LeaderboardQuery['language'];
  scope?: LeaderboardQuery['scope'];
  verified?: boolean;
}

/** The users who may appear on a board: not banned, and with a verified email. */
const userVisible = { bannedAt: null, emailVerifiedAt: { not: null } } as const;

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
    .map((r, i) => entryOf(r, i + 1));
}

function entryOf(r: LeaderboardRow, rank: number): LeaderboardEntry {
  return {
    rank,
    name: r.name,
    wpm: r.wpm,
    rawWpm: r.rawWpm,
    accuracy: r.accuracy,
    createdAt: r.createdAt.toISOString(),
    verified: r.verified,
    resultId: r.id,
  };
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

  /**
   * `scope: 'following'` limits the board to the viewer and the people they follow. The caller
   * must pass the viewer's id for that scope (the controller refuses anonymous requests).
   */
  async top(query: LeaderboardInput, viewerId?: number): Promise<LeaderboardEntry[]> {
    const where = await this.boardWhere(query, viewerId);
    if (query.mode === 'daily') return this.dailyTop(where);
    return this.rank(where);
  }

  /**
   * The board of one event: each user's best verified result for it, under the same best-per-user rule. For
   * the public events endpoint (src/events). Banned users and unverified emails are left out.
   */
  async eventLeaderboard(eventId: number): Promise<LeaderboardEntry[]> {
    return this.rank({ eventId, verified: true, user: { ...userVisible } });
  }

  /** Each user's best row of the filter, ranked, top LEADERBOARD_SIZE (with the tie query). */
  private async rank(where: Where): Promise<LeaderboardEntry[]> {
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
        select: { id: true, userId: true, wpm: true, rawWpm: true, accuracy: true, createdAt: true, verified: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rankLeaderboard(rows.map((r) => ({ ...r, name: names.get(r.userId) ?? '' })));
  }

  /** The rows of one board: the filter, the banned-user exclusion, and the friends scope. */
  private async boardWhere(query: LeaderboardInput, viewerId: number | undefined): Promise<Where> {
    const where: Where = {
      mode: query.mode,
      mode2: query.mode2,
      language: query.language,
      user: { ...userVisible },
    };
    if (query.verified) where.verified = true;
    if (query.scope === 'following') {
      if (viewerId === undefined) throw new Error('scope=following needs a viewer');
      const follows = await this.prisma.follow.findMany({
        where: { followerId: viewerId },
        select: { followeeId: true },
      });
      where.userId = { in: [viewerId, ...follows.map((f) => f.followeeId)] };
    }
    return where;
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
        verified: true,
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
      verified: r.verified,
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
