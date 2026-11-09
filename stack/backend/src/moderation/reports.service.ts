import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findVisibleUser } from '../users/visible-user';
import type { ReportInput } from './report.schemas';

export const ALREADY_REPORTED = 'You have already reported this user';
export const REPORT_DAILY_LIMIT = 20;
export const REPORT_DAILY_LIMIT_MESSAGE = "You've sent a lot of reports today. Try again tomorrow.";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch milliseconds now. Injected so the rolling window can be tested without waiting. */
export type ReportsClock = () => number;
export const REPORTS_CLOCK = Symbol('REPORTS_CLOCK');

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REPORTS_CLOCK) private readonly clock: ReportsClock,
  ) {}

  /**
   * Files a report against a visible user. One open report per (reporter, target): the check and
   * the insert are separate statements, because the database has no partial unique index that
   * works on all three engines. A race can, rarely, add a second open report; the per-user
   * throttle keeps that unlikely, and a moderator dismissing the duplicate settles it.
   *
   * A reporter may file REPORT_DAILY_LIMIT reports in any rolling 24 hours (429 after that).
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

    const since = new Date(this.clock() - DAY_MS);
    const recent = await this.prisma.report.count({ where: { reporterId, createdAt: { gte: since } } });
    if (recent >= REPORT_DAILY_LIMIT) {
      throw new HttpException(REPORT_DAILY_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.prisma.report.create({
      data: { reporterId, targetId: target.id, reason: input.reason, details: input.details },
    });
  }
}
