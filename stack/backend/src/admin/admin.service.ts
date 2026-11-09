import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserEvents } from '../common/user-events';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { USERNAME_REGEX } from '../auth/auth.schemas';
import type { ReportStatus } from './admin.schemas';

/** Reports listed per request, and results shown per reported user. */
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

export interface AdminUserState {
  id: number;
  name: string;
  bannedAt: string | null;
  banReason: string | null;
}

const NOT_FOUND_USER = 'No user with that name';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly userEvents: UserEvents,
  ) {}

  async listReports(status: ReportStatus): Promise<AdminReport[]> {
    const reports = await this.prisma.report.findMany({
      where: { status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_LIST_SIZE,
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
    });
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
    return reports.map((r, i) => ({
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

  /**
   * Suspends a user: bumps tokenVersion so their sessions end now. Admins cannot be banned. The write
   * only matches a user who is not suspended and not an admin. On a miss, a re-read names the reason.
   * Open race sockets are closed after the commit, through the UserEvents 'banned' event.
   */
  async ban(admin: AuthUser, name: string, reason: string): Promise<AdminUserState> {
    const target = await this.findUserOrThrow(name);
    const bannedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: target.id, bannedAt: null, role: { not: 'admin' } },
        data: { bannedAt, banReason: reason, tokenVersion: { increment: 1 } },
      });
      if (count === 0) await this.explainBanMiss(tx, target.id);
      await tx.adminAction.create({
        data: { adminId: admin.id, action: 'ban', target: `user:${target.id}`, note: reason },
      });
    });
    this.userEvents.banned(target.id);
    return { id: target.id, name: target.name, bannedAt: bannedAt.toISOString(), banReason: reason };
  }

  async unban(admin: AuthUser, name: string): Promise<AdminUserState> {
    const target = await this.findUserOrThrow(name);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: target.id, bannedAt: { not: null } },
        data: { bannedAt: null, banReason: null },
      });
      if (count === 0) {
        const current = await tx.user.findUnique({ where: { id: target.id }, select: { id: true } });
        if (!current) throw new NotFoundException(NOT_FOUND_USER);
        throw new ConflictException('User is not suspended');
      }
      await tx.adminAction.create({
        data: { adminId: admin.id, action: 'unban', target: `user:${target.id}` },
      });
    });
    return { id: target.id, name: target.name, bannedAt: null, banReason: null };
  }

  /** Throws the error that explains a ban write which matched nothing. */
  private async explainBanMiss(tx: Prisma.TransactionClient, userId: number): Promise<never> {
    const current = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!current) throw new NotFoundException(NOT_FOUND_USER);
    if (current.role === 'admin') throw new BadRequestException("Admins can't be banned");
    throw new ConflictException('User is already suspended');
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

  /** Admin actions look users up even when suspended, so a suspended user can still be unbanned. */
  private async findUserOrThrow(name: string): Promise<{
    id: number;
    name: string;
    role: string;
    bannedAt: Date | null;
  }> {
    if (!USERNAME_REGEX.test(name)) throw new NotFoundException(NOT_FOUND_USER);
    const user = await this.prisma.user.findUnique({
      where: { nameLower: name.toLowerCase() },
      select: { id: true, name: true, role: true, bannedAt: true },
    });
    if (!user) throw new NotFoundException(NOT_FOUND_USER);
    return user;
  }
}
