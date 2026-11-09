import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ALREADY_REPORTED, ReportsService } from './reports.service';
import { reportInputSchema } from './report.schemas';

function setup(opts: { target?: { id: number } | null; openReport?: boolean } = {}) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(opts.target === undefined ? { id: 2, name: 'bob', createdAt: new Date(0) } : opts.target),
    },
    report: {
      findFirst: jest.fn().mockResolvedValue(opts.openReport ? { id: 5 } : null),
      create: jest.fn().mockResolvedValue({ id: 6 }),
    },
  };
  return { service: new ReportsService(prisma as unknown as PrismaService), prisma };
}

const input = { reason: 'cheating' as const, details: 'copied a snippet' };

describe('ReportsService.create', () => {
  it('stores one open report for the reporter and target', async () => {
    const { service, prisma } = setup();
    await service.create(1, 'bob', input);
    expect(prisma.report.findFirst).toHaveBeenCalledWith({
      where: { reporterId: 1, targetId: 2, status: 'open' },
      select: { id: true },
    });
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: { reporterId: 1, targetId: 2, reason: 'cheating', details: 'copied a snippet' },
    });
  });

  it('refuses a second open report for the same pair with 409 and the spec message', async () => {
    const { service, prisma } = setup({ openReport: true });
    const err = await service.create(1, 'bob', input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe('You have already reported this user');
    expect(ALREADY_REPORTED).toBe('You have already reported this user');
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('refuses a report against yourself with 400', async () => {
    const { service, prisma } = setup({ target: { id: 1 } });
    await expect(service.create(1, 'alice', input)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('gives a 404 for an unknown or suspended user', async () => {
    const { service, prisma } = setup({ target: null });
    await expect(service.create(1, 'nobody', input)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });
});

describe('reportInputSchema', () => {
  it('accepts the three reasons, and trims or drops empty details', () => {
    for (const reason of ['name', 'cheating', 'other']) {
      expect(reportInputSchema.parse({ reason }).reason).toBe(reason);
    }
    expect(reportInputSchema.parse({ reason: 'other', details: '  hi  ' }).details).toBe('hi');
    expect(reportInputSchema.parse({ reason: 'other', details: '   ' }).details).toBeNull();
    expect(reportInputSchema.parse({ reason: 'other' }).details).toBeNull();
  });

  it('rejects an unknown reason and details over 500 characters', () => {
    expect(reportInputSchema.safeParse({ reason: 'spam' }).success).toBe(false);
    expect(reportInputSchema.safeParse({ reason: 'other', details: 'x'.repeat(500) }).success).toBe(true);
    expect(reportInputSchema.safeParse({ reason: 'other', details: 'x'.repeat(501) }).success).toBe(false);
  });
});
