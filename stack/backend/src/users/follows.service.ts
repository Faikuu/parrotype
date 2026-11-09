import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findVisibleUser } from './visible-user';

/** Most people one user may follow. Beyond this, a new follow is a 400. */
export const MAX_FOLLOWS = 1000;
const NOT_FOUND = 'No user with that name';
/** Attempts at the limited insert before a conflict is given up on. */
const MAX_LIMIT_ATTEMPTS = 3;

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

    try {
      await this.createWithinLimit(followerId, target.id);
    } catch (err) {
      // A concurrent follow of the same person already created the row: the result is the same.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    return { following: true };
  }

  /**
   * Counts the follows and inserts the new one in one transaction. Serializable, so two concurrent
   * follows that both read the same count cannot both insert past the limit: the database aborts
   * one with a write conflict (P2034, which also covers a MySQL deadlock), and that attempt is run
   * again, now seeing the other insert. SQLite runs one writer at a time and accepts only Serializable.
   */
  private async createWithinLimit(followerId: number, followeeId: number): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const count = await tx.follow.count({ where: { followerId } });
            if (count >= MAX_FOLLOWS) {
              throw new BadRequestException(`You can follow at most ${MAX_FOLLOWS} people`);
            }
            await tx.follow.create({ data: { followerId, followeeId } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (err) {
        const conflict =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
        if (!conflict || attempt >= MAX_LIMIT_ATTEMPTS) throw err;
      }
    }
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
