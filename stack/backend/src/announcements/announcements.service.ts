import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ANNOUNCEMENTS_ACTIVE_MAX } from './announcement.schemas';

export interface AnnouncementDto {
  id: number;
  message: string;
  level: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

export const ANNOUNCEMENT_SELECT = {
  id: true,
  message: true,
  level: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
} satisfies Prisma.AnnouncementSelect;

type AnnouncementRow = Prisma.AnnouncementGetPayload<{ select: typeof ANNOUNCEMENT_SELECT }>;

export function toAnnouncementDto(row: AnnouncementRow): AnnouncementDto {
  return {
    id: row.id,
    message: row.message,
    level: row.level,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The banners shown now: started, and not yet ended (or never ending). Newest first, at most three. */
export function activeWhere(now: Date): Prisma.AnnouncementWhereInput {
  return { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async active(now: Date = new Date()): Promise<AnnouncementDto[]> {
    const rows = await this.prisma.announcement.findMany({
      where: activeWhere(now),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ANNOUNCEMENTS_ACTIVE_MAX,
      select: ANNOUNCEMENT_SELECT,
    });
    return rows.map(toAnnouncementDto);
  }
}
