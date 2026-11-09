import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findVisibleUser } from './visible-user';

/** Most people one user may follow. Beyond this, a new follow is a 400. */
export const MAX_FOLLOWS = 1000;
const NOT_FOUND = 'No user with that name';

export interface FollowState {
  following: boolean;
}

export interface SocialCounts {
  followers: number;
  following: number;
  isFollowing: boolean;
}

/** Follow and unfollow. Both are idempotent. Suspended accounts cannot be followed (404). */
@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async follow(followerId: number, name: string): Promise<FollowState> {
    const target = await findVisibleUser(this.prisma, name);
    if (!target) throw new NotFoundException(NOT_FOUND);
    if (target.id === followerId) throw new BadRequestException("You can't follow yourself");

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId: target.id } },
      select: { followerId: true },
    });
    if (existing) return { following: true };

    const count = await this.prisma.follow.count({ where: { followerId } });
    if (count >= MAX_FOLLOWS) {
      throw new BadRequestException(`You can follow at most ${MAX_FOLLOWS} people`);
    }
    try {
      await this.prisma.follow.create({ data: { followerId, followeeId: target.id } });
    } catch (err) {
      // A concurrent follow of the same person already created the row: the result is the same.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    return { following: true };
  }

  /**
   * Removes the follow. Looks the name up without the suspension filter, so a user can still
   * drop a follow of someone who was suspended later. An unknown name is still a 404.
   */
  async unfollow(followerId: number, name: string): Promise<FollowState> {
    const target = await this.prisma.user.findUnique({
      where: { nameLower: name.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw new NotFoundException(NOT_FOUND);
    await this.prisma.follow.deleteMany({ where: { followerId, followeeId: target.id } });
    return { following: false };
  }

  /** Follower and following counts (suspended accounts excluded) and whether the viewer follows the user. */
  async socialCounts(userId: number, viewerId?: number): Promise<SocialCounts> {
    const [followers, following, isFollowing] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: userId, follower: { bannedAt: null } } }),
      this.prisma.follow.count({ where: { followerId: userId, followee: { bannedAt: null } } }),
      viewerId === undefined || viewerId === userId
        ? Promise.resolve(false)
        : this.prisma.follow
            .count({ where: { followerId: viewerId, followeeId: userId } })
            .then((n) => n > 0),
    ]);
    return { followers, following, isFollowing };
  }
}
