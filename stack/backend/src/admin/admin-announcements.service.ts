import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { pageArgs, toPage, type Page } from '../common/pagination';
import {
  type AnnouncementCreateInput,
  type AnnouncementsQuery,
  type AnnouncementUpdateInput,
} from '../announcements/announcement.schemas';
import { ANNOUNCEMENT_SELECT, toAnnouncementDto, type AnnouncementDto } from '../announcements/announcements.service';
import { windowProblem } from '../common/time-window';
import { PrismaService } from '../prisma/prisma.service';

const NOT_FOUND = 'No announcement with that id';

/** Site announcements, managed by announcements.manage. Every write commits with its AdminAction row. */
@Injectable()
export class AdminAnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AnnouncementsQuery): Promise<Page<AnnouncementDto>> {
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
        select: ANNOUNCEMENT_SELECT,
      }),
      this.prisma.announcement.count(),
    ]);
    return toPage(rows.map(toAnnouncementDto), total, query);
  }

  async create(admin: AuthUser, input: AnnouncementCreateInput): Promise<AnnouncementDto> {
    return this.prisma.writeTx(async (tx) => {
      const row = await tx.announcement.create({
        data: {
          message: input.message,
          level: input.level,
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          createdBy: admin.id,
        },
        select: ANNOUNCEMENT_SELECT,
      });
      await tx.adminAction.create({
        data: {
          adminId: admin.id,
          action: 'announcement_create',
          target: `announcement:${row.id}`,
          note: JSON.stringify({ level: row.level, startsAt: row.startsAt.toISOString() }),
        },
      });
      return toAnnouncementDto(row);
    });
  }

  /** The window is checked on the merged values: a change to only one end must still leave endsAt after startsAt. */
  async update(admin: AuthUser, id: number, input: AnnouncementUpdateInput): Promise<AnnouncementDto> {
    return this.prisma.writeTx(async (tx) => {
      const current = await tx.announcement.findUnique({ where: { id }, select: { startsAt: true, endsAt: true } });
      if (!current) throw new NotFoundException(NOT_FOUND);
      const startsAt = input.startsAt ?? current.startsAt;
      const endsAt = input.endsAt !== undefined ? input.endsAt : current.endsAt;
      const problem = windowProblem(startsAt, endsAt);
      if (problem) throw new BadRequestException(problem);

      const data: Prisma.AnnouncementUpdateInput = {
        ...(input.message !== undefined ? { message: input.message } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      };
      const row = await tx.announcement.update({ where: { id }, data, select: ANNOUNCEMENT_SELECT });
      await tx.adminAction.create({
        data: {
          adminId: admin.id,
          action: 'announcement_update',
          target: `announcement:${id}`,
          note: JSON.stringify({ changed: Object.keys(input) }),
        },
      });
      return toAnnouncementDto(row);
    });
  }

  async remove(admin: AuthUser, id: number): Promise<{ ok: true }> {
    await this.prisma.writeTx(async (tx) => {
      const current = await tx.announcement.findUnique({ where: { id }, select: { id: true } });
      if (!current) throw new NotFoundException(NOT_FOUND);
      await tx.announcement.delete({ where: { id } });
      await tx.adminAction.create({
        data: { adminId: admin.id, action: 'announcement_delete', target: `announcement:${id}` },
      });
    });
    return { ok: true };
  }
}
