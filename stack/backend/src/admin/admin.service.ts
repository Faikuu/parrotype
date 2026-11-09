import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { pageArgs, toPage, type Page, type PageQuery } from '../common/pagination';
import type { ReportStatus } from './admin.schemas';

/** Audit rows listed per request, and results shown per reported user. */
export const ADMIN_LIST_SIZE = 100;
export const TARGET_RESULTS_SIZE = 5;

export type ReportDecision = 'resolve' | 'dismiss';

export interface AdminReport {
  id: number;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: number; name: string };
  target: { id: number; name: string; bannedAt: string | null; banReason: string | null };
  /** The target's most recent results, newest first. */
  targetResults: Array<{
    id: number;
    mode: string;
    mode2: string;
    language: string;
    wpm: number;
    accuracy: number;
    createdAt: string;
  }>;
}

export interface AdminAuditEntry {
  id: number;
  adminId: number | null;
  /** Null for CLI actions and for admins who were deleted since. */
  adminName: string | null;
  action: string;
  target: string;
  note: string | null;
  createdAt: string;
}

const decisionAction: Record<ReportDecision, string> = {
  resolve: 'resolve_report',
  dismiss: 'dismiss_report',
};
const decisionStatus: Record<ReportDecision, ReportStatus> = {
  resolve: 'resolved',
  dismiss: 'dismissed',
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listReports(query: PageQuery & { status: ReportStatus }): Promise<Page<AdminReport>> {
    const where = { status: query.status };
    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
        select: {
          id: true,
          reason: true,
          details: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
          reporter: { select: { id: true, name: true } },
          target: { select: { id: true, name: true, bannedAt: true, banReason: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    // One small query per reported user, each capped, instead of reading every result of every target.
    const recent = await Promise.all(
      reports.map((r) =>
        this.prisma.result.findMany({
          where: { userId: r.target.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: TARGET_RESULTS_SIZE,
          select: { id: true, mode: true, mode2: true, language: true, wpm: true, accuracy: true, createdAt: true },
        }),
      ),
    );
    const items = reports.map((r, i) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      reporter: r.reporter,
      target: {
        id: r.target.id,
        name: r.target.name,
        bannedAt: r.target.bannedAt?.toISOString() ?? null,
        banReason: r.target.banReason,
      },
      targetResults: recent[i].map((res) => ({
        id: res.id,
        mode: res.mode,
        mode2: res.mode2,
        language: res.language,
        wpm: res.wpm,
        accuracy: res.accuracy,
        createdAt: res.createdAt.toISOString(),
      })),
    }));
    return toPage(items, total, query);
  }

  /**
   * Resolve or dismiss an open report. Only open reports can be decided. The status change is a
   * conditional write, so two admins deciding at once get one winner: the loser's write matches
   * nothing, gets its error from a re-read, and writes no audit row (the transaction rolls back).
   */
  async decideReport(admin: AuthUser, reportId: number, decision: ReportDecision): Promise<{ id: number; status: string }> {
    const status = decisionStatus[decision];
    const resolvedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.report.updateMany({
        where: { id: reportId, status: 'open' },
        data: { status, resolvedAt },
      });
      if (count === 0) {
        const report = await tx.report.findUnique({ where: { id: reportId }, select: { status: true } });
        if (!report) throw new NotFoundException('No report with that id');
        throw new ConflictException(`Report is already ${report.status}`);
      }
      await tx.adminAction.create({
        data: { adminId: admin.id, action: decisionAction[decision], target: `report:${reportId}` },
      });
      return { id: reportId, status };
    });
  }

  async deleteResult(admin: AuthUser, resultId: number): Promise<{ ok: true }> {
    const result = await this.prisma.result.findUnique({
      where: { id: resultId },
      select: { id: true, userId: true },
    });
    if (!result) throw new NotFoundException('No result with that id');

    await this.prisma.$transaction(async (tx) => {
      await tx.result.delete({ where: { id: resultId } });
      await tx.adminAction.create({
        data: {
          adminId: admin.id,
          action: 'delete_result',
          target: `result:${resultId}`,
          note: `user:${result.userId}`,
        },
      });
    });
    return { ok: true };
  }

  /** The newest audit entries, with the admin's name where the admin still exists. */
  async listActions(): Promise<AdminAuditEntry[]> {
    const rows = await this.prisma.adminAction.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_LIST_SIZE,
    });
    const adminIds = [...new Set(rows.flatMap((r) => (r.adminId === null ? [] : [r.adminId])))];
    const admins = adminIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(admins.map((a) => [a.id, a.name]));
    return rows.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      adminName: r.adminId === null ? null : (names.get(r.adminId) ?? null),
      action: r.action,
      target: r.target,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
