import type { PrismaService } from '../prisma/prisma.service';
import { FOLLOW_DEDUPE_MS, NOTIFICATIONS_KEEP, NotificationsService, pruneNotifications } from './notifications.service';

type Mock = jest.Mock;

/**
 * An in-memory notification table: enough of Prisma's notification API for the service's reads and writes.
 * writeTx runs its callback against the same table, so the insert and the prune are checked together.
 */
function setup(initial: Array<{ id: number; userId: number; kind?: string; data?: string; readAt?: Date | null; createdAt?: Date }> = []) {
  const rows = initial.map((r) => ({
    kind: 'follow',
    data: '{}',
    readAt: null,
    createdAt: new Date(0),
    ...r,
  }));
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  const matches = (row: (typeof rows)[number], where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (key === 'data' && cond && typeof cond === 'object' && 'contains' in cond) {
        return row.data.includes((cond as { contains: string }).contains);
      }
      if (key === 'createdAt' && cond && typeof cond === 'object' && 'gte' in cond) {
        return row.createdAt >= (cond as { gte: Date }).gte;
      }
      if (key === 'readAt') return cond === null ? row.readAt === null : true;
      if (key === 'id' && cond && typeof cond === 'object') {
        const c = cond as { in?: number[]; lte?: number };
        if (c.in) return c.in.includes(row.id);
        if (c.lte !== undefined) return row.id <= c.lte;
      }
      return (row as Record<string, unknown>)[key] === cond;
    });
  const notification = {
    createMany: jest.fn(async ({ data }: { data: Array<{ userId: number; kind: string; data: string }> }) => {
      for (const d of data) rows.push({ id: nextId++, readAt: null, createdAt: new Date(), ...d });
      return { count: data.length };
    }),
    findFirst: jest.fn(async ({ where, orderBy, skip }: { where: Record<string, unknown>; orderBy?: unknown; skip?: number }) => {
      let found = rows.filter((r) => matches(r, where));
      if (orderBy) found = found.sort((a, b) => b.id - a.id);
      return found[skip ?? 0] ?? null;
    }),
    findMany: jest.fn(async ({ where, skip = 0, take }: { where: Record<string, unknown>; skip?: number; take?: number }) => {
      const found = rows.filter((r) => matches(r, where)).sort((a, b) => b.id - a.id);
      return found.slice(skip, take === undefined ? undefined : skip + take);
    }),
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length),
    deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const doomed = rows.filter((r) => matches(r, where));
      for (const d of doomed) rows.splice(rows.indexOf(d), 1);
      return { count: doomed.length };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: { readAt: Date } }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) r.readAt = data.readAt;
      return { count: hit.length };
    }),
  };
  const db = { notification };
  const prisma = Object.assign(db, {
    writeTx: jest.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  });
  return { service: new NotificationsService(prisma as unknown as PrismaService), prisma, notification, rows };
}

const userRows = (userId: number, n: number, startId = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: startId + i, userId }));

describe('NotificationsService.create and the 200-per-user prune', () => {
  it('keeps the newest 200 of a user and deletes the oldest on insert', async () => {
    const { service, rows } = setup(userRows(1, NOTIFICATIONS_KEEP));
    await service.create([{ userId: 1, kind: 'follow', data: { by: 'bob' } }]);
    expect(rows.filter((r) => r.userId === 1)).toHaveLength(NOTIFICATIONS_KEEP);
    expect(rows.some((r) => r.id === 1)).toBe(false);
    expect(rows.some((r) => r.id === NOTIFICATIONS_KEEP + 1)).toBe(true);
  });

  it('prunes in the same transaction as the insert', async () => {
    const { service, prisma } = setup(userRows(1, NOTIFICATIONS_KEEP + 5));
    await service.create([{ userId: 1, kind: 'follow', data: { by: 'bob' } }]);
    expect(prisma.writeTx).toHaveBeenCalledTimes(1);
  });

  it('does not touch other users', async () => {
    const { service, rows } = setup([...userRows(1, NOTIFICATIONS_KEEP, 1), ...userRows(2, 3, 1000)]);
    await service.create([{ userId: 1, kind: 'follow', data: { by: 'bob' } }]);
    expect(rows.filter((r) => r.userId === 2)).toHaveLength(3);
  });

  it('stores the data as JSON', async () => {
    const { service, notification } = setup();
    await service.create([{ userId: 4, kind: 'report_outcome', data: { target: 'carol' } }]);
    expect(notification.createMany).toHaveBeenCalledWith({
      data: [{ userId: 4, kind: 'report_outcome', data: '{"target":"carol"}' }],
    });
  });

  it('writes nothing for an empty list', async () => {
    const { service, prisma } = setup();
    await service.create([]);
    expect(prisma.writeTx).not.toHaveBeenCalled();
  });
});

describe('pruneNotifications', () => {
  it('reports how many rows it removed, and removes none under the limit', async () => {
    const small = setup(userRows(1, 10));
    expect(await pruneNotifications(small.prisma as never, 1)).toBe(0);
    const big = setup(userRows(1, NOTIFICATIONS_KEEP + 2));
    expect(await pruneNotifications(big.prisma as never, 1)).toBe(2);
  });
});

describe('NotificationsService.notifyFollow dedupe', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');

  it('creates a follow notice for the followee', async () => {
    const { service, rows } = setup();
    expect(await service.notifyFollow(2, 'alice', now)).toBe(true);
    expect(rows).toEqual([expect.objectContaining({ userId: 2, kind: 'follow', data: '{"by":"alice"}' })]);
  });

  it('does not repeat the notice for the same follower within 24 hours', async () => {
    const { service, rows } = setup([
      { id: 1, userId: 2, kind: 'follow', data: '{"by":"alice"}', createdAt: new Date(now - FOLLOW_DEDUPE_MS + 60_000) },
    ]);
    expect(await service.notifyFollow(2, 'alice', now)).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('notifies again once the 24 hours have passed', async () => {
    const { service, rows } = setup([
      { id: 1, userId: 2, kind: 'follow', data: '{"by":"alice"}', createdAt: new Date(now - FOLLOW_DEDUPE_MS - 1000) },
    ]);
    expect(await service.notifyFollow(2, 'alice', now)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('dedupes per follower: another follower still notifies', async () => {
    const { service } = setup([
      { id: 1, userId: 2, kind: 'follow', data: '{"by":"alice"}', createdAt: new Date(now) },
    ]);
    expect(await service.notifyFollow(2, 'alicia', now)).toBe(true);
  });

  it('ignores another user\'s notices with the same name', async () => {
    const { service } = setup([
      { id: 1, userId: 3, kind: 'follow', data: '{"by":"alice"}', createdAt: new Date(now) },
    ]);
    expect(await service.notifyFollow(2, 'alice', now)).toBe(true);
  });
});

describe('NotificationsService.list and unreadCount', () => {
  const rows = [
    { id: 1, userId: 1, kind: 'follow', data: '{"by":"a"}', readAt: new Date(1) },
    { id: 2, userId: 1, kind: 'follow', data: '{"by":"b"}' },
    { id: 3, userId: 1, kind: 'pb_beaten', data: '{"by":"c","mode":"time","mode2":"60","language":"en","wpm":90}' },
    { id: 4, userId: 2, kind: 'follow', data: '{"by":"d"}' },
  ];

  it('lists the caller\'s notifications newest first, with the data parsed', async () => {
    const { service } = setup(rows);
    const page = await service.list(1, { page: 1, pageSize: 25 });
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.id)).toEqual([3, 2, 1]);
    expect(page.items[0].data).toEqual({ by: 'c', mode: 'time', mode2: '60', language: 'en', wpm: 90 });
    expect(page.items[2].readAt).toBe(new Date(1).toISOString());
  });

  it('keeps only unread ones with unread=true', async () => {
    const { service } = setup(rows);
    const page = await service.list(1, { page: 1, pageSize: 25, unread: 'true' });
    expect(page.items.map((i) => i.id)).toEqual([3, 2]);
    expect(page.total).toBe(2);
  });

  it('counts the unread ones of the caller only', async () => {
    const { service } = setup(rows);
    expect(await service.unreadCount(1)).toBe(2);
    expect(await service.unreadCount(2)).toBe(1);
    expect(await service.unreadCount(3)).toBe(0);
  });

  it('reads a stored value that is not an object as {}', async () => {
    const { service } = setup([{ id: 1, userId: 1, data: '[1,2]' }]);
    expect((await service.list(1, { page: 1, pageSize: 25 })).items[0].data).toEqual({});
  });
});

describe('NotificationsService.markRead', () => {
  it('marks the listed ids of the caller read, and returns how many changed', async () => {
    const { service, rows } = setup([
      { id: 1, userId: 1 },
      { id: 2, userId: 1 },
      { id: 3, userId: 1 },
    ]);
    expect(await service.markRead(1, [1, 3])).toEqual({ updated: 2 });
    expect(rows.map((r) => r.readAt !== null)).toEqual([true, false, true]);
  });

  it('ignores ids that belong to another user', async () => {
    const { service, rows } = setup([
      { id: 1, userId: 1 },
      { id: 2, userId: 2 },
    ]);
    expect(await service.markRead(1, [1, 2])).toEqual({ updated: 1 });
    expect(rows.find((r) => r.id === 2)?.readAt).toBeNull();
  });

  it('marks all of the caller\'s unread ones when no ids are given, and leaves the rest alone', async () => {
    const earlier = new Date(5);
    const { service, rows, notification } = setup([
      { id: 1, userId: 1 },
      { id: 2, userId: 1, readAt: earlier },
      { id: 3, userId: 2 },
    ]);
    expect(await service.markRead(1)).toEqual({ updated: 1 });
    expect(rows.find((r) => r.id === 2)?.readAt).toBe(earlier);
    expect(rows.find((r) => r.id === 3)?.readAt).toBeNull();
    expect((notification.updateMany as Mock).mock.calls[0][0].where).toEqual({ userId: 1, readAt: null });
  });

  it('a second call with the same ids marks nothing more', async () => {
    const { service } = setup([{ id: 1, userId: 1 }]);
    await service.markRead(1, [1]);
    expect(await service.markRead(1, [1])).toEqual({ updated: 0 });
  });
});
