import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { quoteIdent } from '../common/sql-ident';
import { pageArgs, toPage, type Page, type PageQuery } from '../common/pagination';
import { countByDay, daysAgo, startOfUtcDay, windowStart, type DayCount } from './stats';
import { suspiciousWhere } from './suspicious';
import { RoomService, type RoomSummary } from '../races/room.service';
import type { ActionsQuery, ReportStatus, ResultsQuery } from './admin.schemas';

/** Results shown per reported user. */
export const TARGET_RESULTS_SIZE = 5;

/** The dashboard numbers (docs/SPEC-2.4.md, GET /admin/stats). */
export interface AdminStats {
  users: { total: number; new7d: number; banned: number };
  results: { total: number; today: number; last7d: number };
  reports: { open: number };
  races: { rooms: number; players: number };
  signupsByDay: DayCount[];
  resultsByDay: DayCount[];
}

/** One result in the admin results list, with its owner's name. */
export interface AdminResultRow {
  id: number;
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  createdAt: string;
  user: { id: number; name: string };
}

const RESULT_ROW_SELECT = {
  id: true,
  mode: true,
  mode2: true,
  language: true,
  wpm: true,
  rawWpm: true,
  accuracy: true,
  consistency: true,
  durationMs: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} satisfies Prisma.ResultSelect;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomService,
  ) {}

  /**
   * The dashboard. The two day series are bucketed here from createdAt-only reads of the 30-day window, so
   * they are the same on every engine (no date functions in the SQL). Days with nothing are zero.
   */
  async stats(now: number = Date.now()): Promise<AdminStats> {
    const since = windowStart(now);
    const [usersTotal, usersNew, usersBanned, resultsTotal, resultsToday, resultsWeek, openReports, signups, results] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: { gte: daysAgo(now, 7) } } }),
        this.prisma.user.count({ where: { bannedAt: { not: null } } }),
        this.prisma.result.count(),
        this.prisma.result.count({ where: { createdAt: { gte: startOfUtcDay(now) } } }),
        this.prisma.result.count({ where: { createdAt: { gte: daysAgo(now, 7) } } }),
        this.prisma.report.count({ where: { status: 'open' } }),
        this.prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        this.prisma.result.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      ]);
    return {
      users: { total: usersTotal, new7d: usersNew, banned: usersBanned },
      results: { total: resultsTotal, today: resultsToday, last7d: resultsWeek },
      reports: { open: openReports },
      races: { rooms: this.rooms.roomCount, players: this.rooms.playerCount },
      signupsByDay: countByDay(signups.map((u) => u.createdAt), now),
      resultsByDay: countByDay(results.map((r) => r.createdAt), now),
    };
  }

  /** Every result across users, filtered and sorted in the database, one page at a time. */
  async listResults(query: ResultsQuery): Promise<Page<AdminResultRow>> {
    const user = query.user?.toLowerCase();
    const where: Prisma.ResultWhereInput = {
      ...(user ? { user: { nameLower: user } } : {}),
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.suspicious === 'true' ? suspiciousWhere(await this.cheatResultIds()) : {}),
    };
    const direction = query.order;
    const orderBy: Prisma.ResultOrderByWithRelationInput[] =
      query.sort === 'wpm' ? [{ wpm: direction }, { id: direction }] : [{ createdAt: direction }, { id: direction }];
    const [rows, total] = await Promise.all([
      this.prisma.result.findMany({ where, orderBy, ...pageArgs(query), select: RESULT_ROW_SELECT }),
      this.prisma.result.count({ where }),
    ]);
    const items = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    return toPage(items, total, query);
  }

  /**
   * The ids of results where wpm is above rawWpm. Prisma can't compare two columns in a where, so this one
   * clause is read here, run only for the suspicious filter. Submissions already reject wpm > rawWpm + 0.5,
   * so these rows only come from older or imported data; the newest 1000 are enough for review and keep
   * the IN list bounded.
   */
  private async cheatResultIds(): Promise<number[]> {
    const q = quoteIdent;
    const rows = await this.prisma.$queryRaw<Array<{ id: unknown }>>(
      Prisma.sql`${Prisma.raw(`SELECT ${q('id')} AS ${q('id')} FROM ${q('Result')} WHERE ${q('wpm')} > ${q('rawWpm')} ORDER BY ${q('id')} DESC LIMIT 1000`)}`,
    );
    return rows.map((r) => Number(r.id));
  }

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
    return this.prisma.writeTx(async (tx) => {
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

    await this.prisma.writeTx(async (tx) => {
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

  /**
   * Closes a live race for a moderator. The members get the error and their sockets close (see the gateway).
   * The room is not a database row, so the AdminAction is written after the close, in its own transaction.
   */
  async closeRace(admin: AuthUser, roomId: string): Promise<{ ok: true }> {
    if (!this.rooms.closeRoom(roomId, 'moderator')) throw new NotFoundException('No race with that id');
    await this.prisma.writeTx((tx) =>
      tx.adminAction.create({ data: { adminId: admin.id, action: 'race_close', target: `race:${roomId}` } }),
    );
    return { ok: true };
  }

  /** Live race rooms, newest first. */
  listRaces(): RoomSummary[] {
    return this.rooms.list();
  }

  /**
   * The audit log, newest first. `admin` is a user name (matched case-insensitively; an unknown name matches
   * nothing) and `target` is a substring of the target text. The admin's name is read for the rows of this page.
   */
  async listActions(query: ActionsQuery): Promise<Page<AdminAuditEntry>> {
    const admin = query.admin ? await this.prisma.user.findUnique({ where: { nameLower: query.admin.toLowerCase() }, select: { id: true } }) : null;
    const where: Prisma.AdminActionWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.admin ? { adminId: admin ? admin.id : { in: [] } } : {}),
      ...(query.target ? { target: { contains: query.target } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.adminAction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.adminAction.count({ where }),
    ]);
    const adminIds = [...new Set(rows.flatMap((r) => (r.adminId === null ? [] : [r.adminId])))];
    const admins = adminIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(admins.map((a) => [a.id, a.name]));
    const items = rows.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      adminName: r.adminId === null ? null : (names.get(r.adminId) ?? null),
      action: r.action,
      target: r.target,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
    return toPage(items, total, query);
  }
}
