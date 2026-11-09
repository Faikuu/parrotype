import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { AdminService, TARGET_RESULTS_SIZE } from './admin.service';

const me: AuthUser = { id: 1, name: 'root', role: 'admin' };

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
} = {}) {
  const db = {
    user: {
      findUnique: jest.fn().mockResolvedValue(overrides.user === undefined ? null : overrides.user),
      findMany: jest.fn().mockResolvedValue(overrides.adminNames ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    report: {
      findUnique: jest.fn().mockResolvedValue(overrides.report ?? null),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
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

const typist = { id: 7, name: 'typist', role: 'user', bannedAt: null, banReason: null };

describe('AdminService.ban', () => {
  it('suspends the user, bumps tokenVersion so their sessions end, and logs it in the same transaction', async () => {
    const { service, prisma } = setup({ user: typist });

    const state = await service.ban(me, 'Typist', 'spam accounts');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ banReason: 'spam accounts', tokenVersion: { increment: 1 } }),
    });
    const { bannedAt } = prisma.user.update.mock.calls[0][0].data as { bannedAt: Date };
    expect(bannedAt).toBeInstanceOf(Date);
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'ban', target: 'user:7', note: 'spam accounts' },
    });
    expect(state).toEqual({ id: 7, name: 'typist', bannedAt: bannedAt.toISOString(), banReason: 'spam accounts' });
  });

  it('looks the name up case-insensitively, including suspended users', async () => {
    const { service, prisma } = setup({ user: { ...typist, bannedAt: new Date(0) } });
    await expect(service.ban(me, 'TYPIST', 'again')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { nameLower: 'typist' } }));
  });

  it('refuses to ban another admin with 400 and writes nothing', async () => {
    const { service, prisma } = setup({ user: { ...typist, role: 'admin' } });
    await expect(service.ban(me, 'typist', 'no')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.adminAction.create).not.toHaveBeenCalled();
  });

  it('refuses an already suspended user with 409', async () => {
    const { service, prisma } = setup({ user: { ...typist, bannedAt: new Date(0) } });
    await expect(service.ban(me, 'typist', 'again')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('gives a 404 for an unknown or invalid name', async () => {
    const { service } = setup({ user: null });
    await expect(service.ban(me, 'nobody', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.ban(me, 'a!', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminService.unban', () => {
  it('clears the suspension and logs it', async () => {
    const { service, prisma } = setup({ user: { ...typist, bannedAt: new Date(0), banReason: 'x' } });
    const state = await service.unban(me, 'typist');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { bannedAt: null, banReason: null },
    });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: { adminId: 1, action: 'unban', target: 'user:7' },
    });
    expect(state).toEqual({ id: 7, name: 'typist', bannedAt: null, banReason: null });
  });

  it('refuses a user who is not suspended with 409', async () => {
    const { service, prisma } = setup({ user: typist });
    await expect(service.unban(me, 'typist')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AdminService report decisions', () => {
  it('resolves an open report, stamps it and logs resolve_report', async () => {
    const { service, prisma } = setup({ report: { id: 3, status: 'open' } });
    expect(await service.decideReport(me, 3, 'resolve')).toEqual({ id: 3, status: 'resolved' });
    expect(prisma.report.update).toHaveBeenCalledWith({
      where: { id: 3 },
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

  it('will not decide a report twice (409), and a missing report is 404', async () => {
    const twice = setup({ report: { id: 3, status: 'resolved' } });
    await expect(twice.service.decideReport(me, 3, 'dismiss')).rejects.toBeInstanceOf(ConflictException);
    expect(twice.prisma.report.update).not.toHaveBeenCalled();

    const missing = setup({ report: null });
    await expect(missing.service.decideReport(me, 99, 'resolve')).rejects.toBeInstanceOf(NotFoundException);
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
  it('lists reports with at most TARGET_RESULTS_SIZE recent results per target', async () => {
    const { service, prisma } = setup();
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

    const reports = await service.listReports('open');

    expect(prisma.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'open' }, take: 100 }));
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
