import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findVisibleUser } from '../users/visible-user';
import type { ReportInput } from './report.schemas';

export const ALREADY_REPORTED = 'You have already reported this user';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Files a report against a visible user. One open report per (reporter, target): the check and
   * the insert are separate statements, because the database has no partial unique index that
   * works on all three engines. A race can, rarely, add a second open report; the per-user
   * throttle keeps that unlikely, and a moderator dismissing the duplicate settles it.
   */
  async create(reporterId: number, name: string, input: ReportInput): Promise<void> {
    const target = await findVisibleUser(this.prisma, name);
    if (!target) throw new NotFoundException('No user with that name');
    if (target.id === reporterId) throw new BadRequestException("You can't report yourself");

    const open = await this.prisma.report.findFirst({
      where: { reporterId, targetId: target.id, status: 'open' },
      select: { id: true },
    });
    if (open) throw new ConflictException(ALREADY_REPORTED);

    await this.prisma.report.create({
      data: { reporterId, targetId: target.id, reason: input.reason, details: input.details },
    });
  }
}
