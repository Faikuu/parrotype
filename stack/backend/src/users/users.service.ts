import { Injectable, NotFoundException } from '@nestjs/common';
import { RANKED_MODES } from '../common/domain';
import { PrismaService } from '../prisma/prisma.service';
import { buildInsights, type ActivityDay, type Achievement, type Streak } from '../results/insights';
import { bestsForUser, loadInsightRows } from '../results/results.service';
import type { BadgeQuery } from '../results/results.schemas';
import { FollowsService } from './follows.service';
import { findVisibleUser } from './visible-user';

export const PROFILE_RECENT_SIZE = 10;
const NOT_FOUND = 'No user with that name';

export interface ProfileResult {
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  accuracy: number;
  createdAt: string;
}

export interface PublicProfile {
  name: string;
  createdAt: string;
  totalTests: number;
  totalTimeMs: number;
  /** Ranked modes only, best per (mode, mode2, language). */
  bests: ProfileResult[];
  /** The last PROFILE_RECENT_SIZE results, newest first. */
  recent: ProfileResult[];
  streak: Streak;
  achievements: Achievement[];
  /** Last 365 UTC days, only days with tests. */
  activity: ActivityDay[];
  /** Followers and followees who are not suspended. */
  followers: number;
  following: number;
  /** False for anonymous viewers and for your own profile. */
  isFollowing: boolean;
}

export interface ProfileSource {
  name: string;
  createdAt: Date;
  totalTests: number;
  totalTimeMs: number;
  bests: ProfileResult[];
  recent: Array<{
    mode: string;
    mode2: string;
    language: string;
    wpm: number;
    accuracy: number;
    createdAt: Date;
  }>;
  streak: Streak;
  achievements: Achievement[];
  activity: ActivityDay[];
  followers: number;
  following: number;
  isFollowing: boolean;
}

/**
 * Builds the public profile from explicitly chosen fields only. Email is never part of
 * the input, so it cannot leak into the output.
 */
export function toPublicProfile(source: ProfileSource): PublicProfile {
  return {
    name: source.name,
    createdAt: source.createdAt.toISOString(),
    totalTests: source.totalTests,
    totalTimeMs: source.totalTimeMs,
    bests: source.bests,
    recent: source.recent.map((r) => ({
      mode: r.mode,
      mode2: r.mode2,
      language: r.language,
      wpm: r.wpm,
      accuracy: r.accuracy,
      createdAt: r.createdAt.toISOString(),
    })),
    streak: source.streak,
    achievements: source.achievements,
    activity: source.activity,
    followers: source.followers,
    following: source.following,
    isFollowing: source.isFollowing,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly follows: FollowsService,
  ) {}

  /** `viewerId` is the signed-in viewer, if any. It only decides isFollowing. */
  async profile(name: string, viewerId?: number): Promise<PublicProfile> {
    const user = await findVisibleUser(this.prisma, name);
    if (!user) throw new NotFoundException(NOT_FOUND);

    const [totals, recent, bests, insightRows, social] = await Promise.all([
      this.prisma.result.aggregate({
        where: { userId: user.id },
        _count: { _all: true },
        _sum: { durationMs: true },
      }),
      this.prisma.result.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PROFILE_RECENT_SIZE,
        select: { mode: true, mode2: true, language: true, wpm: true, accuracy: true, createdAt: true },
      }),
      bestsForUser(this.prisma, user.id, RANKED_MODES),
      loadInsightRows(this.prisma, user.id),
      this.follows.socialCounts(user.id, viewerId),
    ]);
    const insights = buildInsights(insightRows, new Date());

    return toPublicProfile({
      name: user.name,
      createdAt: user.createdAt,
      totalTests: totals._count._all,
      totalTimeMs: totals._sum.durationMs ?? 0,
      bests,
      recent,
      streak: insights.streak,
      achievements: insights.achievements,
      activity: insights.activity,
      ...social,
    });
  }

  /**
   * The best wpm of the user for one ranked filter, or null when there is no such result or the
   * user is not visible. Throws nothing: the badge turns null into a 404 image.
   */
  async badgeWpm(name: string, query: BadgeQuery): Promise<number | null> {
    const user = await findVisibleUser(this.prisma, name);
    if (!user) return null;
    const best = await this.prisma.result.aggregate({
      where: { userId: user.id, mode: query.mode, mode2: query.mode2, language: query.language },
      _max: { wpm: true },
    });
    return best._max.wpm ?? null;
  }
}
