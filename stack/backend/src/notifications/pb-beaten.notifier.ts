import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isRankedMode } from '../common/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ResultEvents } from '../results/result-events';
import { beatenFollowers, isPbBeatenTrigger, PB_BEATEN_FOLLOWER_CAP, type SavedResultEvent } from './pb-beaten';
import { NotificationsService } from './notifications.service';

/**
 * The pb_beaten rule. On a 'saved' result that is verified, a new best and ranked, the saver's followers
 * whose own best in the same (mode, mode2, language) is lower get a notice. The work runs after the
 * request has answered: the listener starts it and does not wait, and a failure is logged, not thrown.
 */
@Injectable()
export class PbBeatenNotifier implements OnModuleInit {
  private readonly logger = new Logger(PbBeatenNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly results: ResultEvents,
  ) {}

  onModuleInit(): void {
    this.results.on('saved', (event: SavedResultEvent) => {
      this.onResultSaved(event).catch((err: unknown) => {
        this.logger.error(`pb_beaten for result ${event.resultId} failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    });
  }

  /**
   * Notifies the beaten followers of the saver. Returns how many notices were written. Only the first
   * PB_BEATEN_FOLLOWER_CAP followers of the saver are looked at (newest follows first), which bounds both reads.
   */
  async onResultSaved(event: SavedResultEvent): Promise<number> {
    if (!isPbBeatenTrigger(event, isRankedMode)) return 0;

    const follows = await this.prisma.follow.findMany({
      where: { followeeId: event.userId, follower: { bannedAt: null } },
      orderBy: [{ createdAt: 'desc' }, { followerId: 'asc' }],
      take: PB_BEATEN_FOLLOWER_CAP,
      select: { followerId: true },
    });
    if (follows.length === 0) return 0;
    const followerIds = follows.map((f) => f.followerId);

    // Verified bests only: the same rule the public boards use.
    const bests = await this.prisma.result.groupBy({
      by: ['userId'],
      where: {
        userId: { in: followerIds },
        mode: event.mode,
        mode2: event.mode2,
        language: event.language,
        verified: true,
      },
      _max: { wpm: true },
    });
    const bestByUser = new Map(bests.map((b) => [b.userId, b._max.wpm]));
    const beaten = beatenFollowers(
      event.wpm,
      followerIds.map((userId) => ({ userId, best: bestByUser.get(userId) ?? null })),
    );
    if (beaten.length === 0) return 0;

    const saver = await this.prisma.user.findUnique({ where: { id: event.userId }, select: { name: true } });
    if (!saver) return 0;
    await this.notifications.create(
      beaten.map((userId) => ({
        userId,
        kind: 'pb_beaten' as const,
        data: { by: saver.name, mode: event.mode, mode2: event.mode2, language: event.language, wpm: event.wpm },
      })),
    );
    return beaten.length;
  }
}
