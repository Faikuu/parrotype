import { Injectable, NotFoundException } from '@nestjs/common';
import { RANKED_MODES } from '../common/domain';
import { USERNAME_REGEX } from '../auth/auth.schemas';
import { PrismaService } from '../prisma/prisma.service';
import { bestsForUser } from '../results/results.service';

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
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Case-insensitive lookup. A name that can't be a username is a plain 404. */
  async profile(name: string): Promise<PublicProfile> {
    if (!USERNAME_REGEX.test(name)) throw new NotFoundException(NOT_FOUND);

    const user = await this.prisma.user.findUnique({
      where: { nameLower: name.toLowerCase() },
      select: { id: true, name: true, createdAt: true },
    });
    if (!user) throw new NotFoundException(NOT_FOUND);

    const [totals, recent, bests] = await Promise.all([
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
    ]);

    return toPublicProfile({
      name: user.name,
      createdAt: user.createdAt,
      totalTests: totals._count._all,
      totalTimeMs: totals._sum.durationMs ?? 0,
      bests,
      recent,
    });
  }
}
