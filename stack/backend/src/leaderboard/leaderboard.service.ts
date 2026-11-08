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
    const rows = await this.prisma.result.findMany({
      where: { mode: query.mode, mode2: query.mode2, language: query.language },
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
    return rankLeaderboard(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.user.name,
        wpm: r.wpm,
        rawWpm: r.rawWpm,
        accuracy: r.accuracy,
        createdAt: r.createdAt,
      })),
    );
  }
}
