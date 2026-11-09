import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageArgs, toPage, type Page } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationsQuery } from './notifications.schemas';

/** Most notifications kept per user. Inserting past this prunes the oldest. */
export const NOTIFICATIONS_KEEP = 200;
/** A repeat follow of the same person inside this window adds no notification. */
export const FOLLOW_DEDUPE_MS = 24 * 60 * 60 * 1000;

export type NotificationKind = 'follow' | 'report_outcome' | 'pb_beaten' | 'announcement' | 'event_start';

/** The JSON `data` of a notification. Kept small: the column holds at most 1000 characters. */
export type NotificationData = Record<string, string | number>;

export interface NewNotification {
  userId: number;
  kind: NotificationKind;
  data: NotificationData;
}

export interface NotificationDto {
  id: number;
  kind: string;
  data: NotificationData;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATION_SELECT = { id: true, kind: true, data: true, readAt: true, createdAt: true } satisfies Prisma.NotificationSelect;

/**
 * Deletes everything but the newest NOTIFICATIONS_KEEP rows of one user. Ids grow with inserts, so the
 * cut is the id of the (KEEP + 1)th newest row. Runs inside the caller's transaction.
 */
export async function pruneNotifications(tx: Prisma.TransactionClient, userId: number): Promise<number> {
  const cut = await tx.notification.findFirst({
    where: { userId },
    orderBy: { id: 'desc' },
    skip: NOTIFICATIONS_KEEP,
    select: { id: true },
  });
  if (!cut) return 0;
  const { count } = await tx.notification.deleteMany({ where: { userId, id: { lte: cut.id } } });
  return count;
}

/** Reads the stored JSON. A value that is not an object (never written by this code) reads as {}. */
function parseData(raw: string): NotificationData {
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as NotificationData) : {};
  } catch {
    return {};
  }
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inserts the rows and prunes each affected user to NOTIFICATIONS_KEEP, in one transaction. */
  async create(rows: NewNotification[]): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.writeTx(async (tx) => {
      await tx.notification.createMany({
        data: rows.map((row) => ({ userId: row.userId, kind: row.kind, data: JSON.stringify(row.data) })),
      });
      for (const userId of new Set(rows.map((row) => row.userId))) {
        await pruneNotifications(tx, userId);
      }
    });
  }

  /**
   * The follow notice for the followee. No repeat for the same follower within FOLLOW_DEDUPE_MS: the
   * follower is matched by the name stored in `data`. Returns false when the notice was deduped.
   */
  async notifyFollow(followeeId: number, followerName: string, now: number = Date.now()): Promise<boolean> {
    const recent = await this.prisma.notification.findFirst({
      where: {
        userId: followeeId,
        kind: 'follow',
        createdAt: { gte: new Date(now - FOLLOW_DEDUPE_MS) },
        data: { contains: JSON.stringify({ by: followerName }) },
      },
      select: { id: true },
    });
    if (recent) return false;
    await this.create([{ userId: followeeId, kind: 'follow', data: { by: followerName } }]);
    return true;
  }

  /** The reporter learns the report was reviewed. The decision is not in the message. */
  async notifyReportOutcome(reporterId: number, targetName: string): Promise<void> {
    await this.create([{ userId: reporterId, kind: 'report_outcome', data: { target: targetName } }]);
  }

  /** The caller's notifications, newest first. `unread=true` keeps the unread ones. */
  async list(userId: number, query: NotificationsQuery): Promise<Page<NotificationDto>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unread === 'true' ? { readAt: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { id: 'desc' }, ...pageArgs(query), select: NOTIFICATION_SELECT }),
      this.prisma.notification.count({ where }),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      data: parseData(row.data),
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
    return toPage(items, total, query);
  }

  async unreadCount(userId: number): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /**
   * Marks the caller's unread notifications read: the listed ids, or all of them when `ids` is undefined.
   * The userId filter is part of the write, so ids that belong to someone else match nothing.
   */
  async markRead(userId: number, ids?: number[], now: Date = new Date()): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids === undefined ? {} : { id: { in: ids } }) },
      data: { readAt: now },
    });
    return { updated: count };
  }
}
