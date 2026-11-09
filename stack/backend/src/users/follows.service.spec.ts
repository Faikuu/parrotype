import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { FollowsService, MAX_FOLLOWS } from './follows.service';

type Mock = jest.Mock;

function setup(opts: {
  target?: { id: number; name: string } | null;
  existing?: boolean;
  count?: number;
  createError?: unknown;
} = {}) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(opts.target === undefined ? { id: 2, name: 'bob', createdAt: new Date(0) } : opts.target),
      findUnique: jest.fn().mockResolvedValue(opts.target === undefined ? { id: 2 } : opts.target),
    },
    follow: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ? { followerId: 1 } : null),
      count: jest.fn().mockResolvedValue(opts.count ?? 0),
      create: opts.createError
        ? jest.fn().mockRejectedValue(opts.createError)
        : jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { service: new FollowsService(prisma as unknown as PrismaService), prisma };
}

describe('FollowsService.follow', () => {
  it('creates the follow and reports following', async () => {
    const { service, prisma } = setup();
    expect(await service.follow(1, 'bob')).toEqual({ following: true });
    expect(prisma.follow.create).toHaveBeenCalledWith({ data: { followerId: 1, followeeId: 2 } });
  });

  it('is idempotent: an existing follow is not counted again or recreated', async () => {
    const { service, prisma } = setup({ existing: true, count: MAX_FOLLOWS });
    expect(await service.follow(1, 'bob')).toEqual({ following: true });
    expect(prisma.follow.count).not.toHaveBeenCalled();
    expect(prisma.follow.create).not.toHaveBeenCalled();
  });

  it('refuses to follow yourself with 400', async () => {
    const { service, prisma } = setup({ target: { id: 1, name: 'alice' } });
    await expect(service.follow(1, 'alice')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.follow.create).not.toHaveBeenCalled();
  });

  it('allows up to 1000 follows and refuses the 1001st with 400', async () => {
    expect(MAX_FOLLOWS).toBe(1000);
    const atLimit = setup({ count: 999 });
    await expect(atLimit.service.follow(1, 'bob')).resolves.toEqual({ following: true });

    const over = setup({ count: 1000 });
    const err = await over.service.follow(1, 'bob').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe("You can follow at most 1000 people");
    expect(over.prisma.follow.create).not.toHaveBeenCalled();
  });

  it('treats a concurrent duplicate insert as success', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service } = setup({ createError: dup });
    await expect(service.follow(1, 'bob')).resolves.toEqual({ following: true });
  });

  it('gives a 404 for an unknown or suspended user (the lookup excludes suspended accounts)', async () => {
    const { service, prisma } = setup({ target: null });
    await expect(service.follow(1, 'nobody')).rejects.toBeInstanceOf(NotFoundException);
    expect((prisma.user.findFirst as Mock).mock.calls[0][0].where).toEqual({ nameLower: 'nobody', bannedAt: null });
  });
});

describe('FollowsService.unfollow', () => {
  it('removes the follow and is idempotent when there is none', async () => {
    const { service, prisma } = setup();
    expect(await service.unfollow(1, 'bob')).toEqual({ following: false });
    expect(prisma.follow.deleteMany).toHaveBeenCalledWith({ where: { followerId: 1, followeeId: 2 } });
  });

  it('still removes a follow of a suspended user, but an unknown name is 404', async () => {
    const { service, prisma } = setup({ target: { id: 2, name: 'bob' } });
    await service.unfollow(1, 'Bob');
    expect((prisma.user.findUnique as Mock).mock.calls[0][0].where).toEqual({ nameLower: 'bob' });

    const none = setup({ target: null });
    await expect(none.service.unfollow(1, 'nobody')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FollowsService.socialCounts', () => {
  it('counts only non-suspended followers and followees, and is false for anonymous viewers', async () => {
    const { service, prisma } = setup();
    (prisma.follow as unknown as { count: Mock }).count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    const counts = await service.socialCounts(2);
    expect(counts).toEqual({ followers: 4, following: 2, isFollowing: false });
    expect(prisma.follow.count.mock.calls[0][0]).toEqual({ where: { followeeId: 2, follower: { bannedAt: null } } });
    expect(prisma.follow.count.mock.calls[1][0]).toEqual({ where: { followerId: 2, followee: { bannedAt: null } } });
    expect(prisma.follow.count).toHaveBeenCalledTimes(2);
  });

  it('reports isFollowing for a signed-in viewer, and never for yourself', async () => {
    const { service, prisma } = setup();
    prisma.follow.count.mockResolvedValue(1);
    expect((await service.socialCounts(2, 1)).isFollowing).toBe(true);
    expect((await service.socialCounts(2, 2)).isFollowing).toBe(false);
  });
});
