import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { AdminService, TARGET_RESULTS_SIZE } from './admin.service';

const me: AuthUser = { id: 1, name: 'root' };

type Row = Record<string, unknown>;

/**
 * A prisma stand-in. $transaction runs its callback against the same mocks, so the writes inside it
 * are visible to the test, and the audit row is checked next to the change it describes.
 */
function setup(overrides: {
  user?: Row | null;
  report?: Row | null;
  result?: Row | null;
  adminActions?: Row[];
  adminNames?: Array<{ id: number; name: string }>;
  /** Rows the conditional writes match (1 when the state allows the change, 0 when it does not). */
  matches?: number;
} = {}) {
  const matches = overrides.matches ?? 1;
  const db = {
    user: {
      findUnique: jest.fn().mockResolvedValue(overrides.user === undefined ? null : overrides.user),
      findMany: jest.fn().mockResolvedValue(overrides.adminNames ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: matches }),
    },
    report: {
      findUnique: jest.fn().mockResolvedValue(overrides.report ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: matches }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    result: {
      findUnique: jest.fn().mockResolvedValue(overrides.result ?? null),
      delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    adminAction: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(overrides.adminActions ?? []),
    },
  };
  const prisma = Object.assign(db, {
    $transaction: jest.fn((cb: (tx: typeof db) => Promise<unknown>) => cb(db)),
  });
  return { service: new AdminService(prisma as unknown as PrismaService), prisma };
}


describe('AdminService report decisions', () => {
  it('resolves an open report, stamps it and logs resolve_report', async () => {
    const { service, prisma } = setup({ report: { id: 3, status: 'open' } });
    expect(await service.decideReport(me, 3, 'resolve')).toEqual({ id: 3, status: 'resolved' });
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { id: 3, status: 'open' },
      data: { status: 'resolved', resolvedAt: expect.any(Date) },
    });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'resolve_report', target: 'report:3' },
    });
  });

  it('dismisses an open report with dismiss_report', async () => {
    const { service, prisma } = setup({ report: { id: 4, status: 'open' } });
    expect(await service.decideReport(me, 4, 'dismiss')).toEqual({ id: 4, status: 'dismissed' });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'dismiss_report', target: 'report:4' },
    });
  });

  it('will not decide a report twice (409) and writes no audit row, and a missing report is 404', async () => {
    const twice = setup({ report: { id: 3, status: 'resolved' }, matches: 0 });
    await expect(twice.service.decideReport(me, 3, 'dismiss')).rejects.toBeInstanceOf(ConflictException);
    await expect(twice.service.decideReport(me, 3, 'dismiss')).rejects.toThrow('Report is already resolved');
    expect(twice.prisma.adminAction.create).not.toHaveBeenCalled();

    const missing = setup({ report: null, matches: 0 });
    await expect(missing.service.decideReport(me, 99, 'resolve')).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.prisma.adminAction.create).not.toHaveBeenCalled();
  });
});

describe('AdminService.deleteResult', () => {
  it('deletes the result and logs delete_result with the owner', async () => {
    const { service, prisma } = setup({ result: { id: 9, userId: 7 } });
    expect(await service.deleteResult(me, 9)).toEqual({ ok: true });
    expect(prisma.result.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'delete_result', target: 'result:9', note: 'user:7' },
    });
  });

  it('gives a 404 and deletes nothing for an unknown result', async () => {
    const { service, prisma } = setup({ result: null });
    await expect(service.deleteResult(me, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.result.delete).not.toHaveBeenCalled();
  });
});

describe('AdminService listings', () => {
  it('pages reports and lists at most TARGET_RESULTS_SIZE recent results per target', async () => {
    const { service, prisma } = setup();
    prisma.report.count.mockResolvedValue(1);
    prisma.report.findMany.mockResolvedValue([
      {
        id: 1,
        reason: 'cheating',
        details: null,
        status: 'open',
        createdAt: new Date(0),
        resolvedAt: null,
        reporter: { id: 2, name: 'reporter' },
        target: { id: 7, name: 'typist', bannedAt: null, banReason: null },
      },
    ]);
    prisma.result.findMany.mockResolvedValue([]);

    const page = await service.listReports({ status: 'open', page: 1, pageSize: 25 });
    const reports = page.items;

    expect(prisma.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'open' }, skip: 0, take: 25 }));
    expect(prisma.report.count).toHaveBeenCalledWith({ where: { status: 'open' } });
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 25 });
    expect(prisma.result.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 }, take: TARGET_RESULTS_SIZE }),
    );
    expect(TARGET_RESULTS_SIZE).toBe(5);
    expect(reports[0]).toMatchObject({ id: 1, reason: 'cheating', target: { id: 7, name: 'typist', bannedAt: null } });
  });

  it('shows the admin name for admin actions, and null for CLI actions and deleted admins', async () => {
    const { service } = setup({
      adminActions: [
        { id: 3, adminId: 1, action: 'ban', target: 'user:7', note: 'x', createdAt: new Date(0) },
        { id: 2, adminId: null, action: 'grant_admin', target: 'user:2', note: 'cli', createdAt: new Date(0) },
        { id: 1, adminId: 99, action: 'unban', target: 'user:7', note: null, createdAt: new Date(0) },
      ],
      adminNames: [{ id: 1, name: 'root' }],
    });
    const entries = await service.listActions();
    expect(entries.map((e) => [e.id, e.adminName])).toEqual([
      [3, 'root'],
      [2, null],
      [1, null],
    ]);
  });
});
