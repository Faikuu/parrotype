import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ALL_PERMISSIONS } from '../src/permissions/catalog';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyE2eEnv } from './e2e.env';
import { makeAdministrator, sessionFor } from './e2e.helpers';

applyE2eEnv();

/**
 * Permission groups, the admin users API and the safety rules. Accounts are made in the database and
 * signed in with sessionFor, because registration and login are throttled. The global request throttle
 * is off for this file: it is not under test here, and the file makes more requests than the limit allows.
 */

const MODERATOR_KEYS = [
  'admin.access', 'audit.read', 'reports.read', 'reports.resolve', 'results.delete', 'results.read', 'users.ban', 'users.read',
];

describe('permission groups, admin users and the safety rules (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;

  let root: string; // Administrator
  let root2: string; // second Administrator, used where the last-Administrator rule needs two
  let mod: string; // Moderators
  let plain: string; // no groups
  let plainId: number;
  let listAId: number;
  let modId: number;
  let rootId: number;
  let root2Id: number;
  let moderatorsId: number;
  let adminsId: number;

  const get = (path: string, cookie?: string) => {
    const req = request(server).get(path);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const post = (path: string, cookie: string, body?: object) => {
    const req = request(server).post(path).set('Cookie', cookie);
    return body === undefined ? req : req.send(body);
  };
  const put = (path: string, cookie: string, body?: object) => {
    const req = request(server).put(path).set('Cookie', cookie);
    return body === undefined ? req : req.send(body);
  };
  const patch = (path: string, cookie: string, body: object) => request(server).patch(path).set('Cookie', cookie).send(body);
  const del = (path: string, cookie: string, body?: object) => {
    const req = request(server).delete(path).set('Cookie', cookie);
    return body === undefined ? req : req.send(body);
  };

  async function makeUser(name: string): Promise<number> {
    const user = await prisma.user.create({
      data: { name, nameLower: name.toLowerCase(), email: `${name.toLowerCase()}@example.com`, passwordHash: 'not-used-here' },
      select: { id: true },
    });
    return user.id;
  }

  async function groupId(name: string): Promise<number> {
    return (await prisma.permissionGroup.findUniqueOrThrow({ where: { name }, select: { id: true } })).id;
  }

  async function addToGroup(userId: number, group: string): Promise<void> {
    await prisma.userGroup.upsert({
      where: { userId_groupId: { userId, groupId: await groupId(group) } },
      create: { userId, groupId: await groupId(group) },
      update: {},
    });
  }

  /**
   * Runs `fn` while `keepNameLower` is the only Administrator, then puts the other memberships back.
   * Other test files create Administrators too, and the last-Administrator rule needs exactly one.
   */
  async function asSoleAdministrator<T>(keepNameLower: string, fn: () => Promise<T>): Promise<T> {
    const adminGroup = await groupId('Administrators');
    const others = await prisma.userGroup.findMany({
      where: { groupId: adminGroup, user: { nameLower: { not: keepNameLower } } },
      select: { userId: true, createdAt: true },
    });
    await prisma.userGroup.deleteMany({ where: { groupId: adminGroup, userId: { in: others.map((o) => o.userId) } } });
    try {
      return await fn();
    } finally {
      for (const o of others) {
        await prisma.userGroup.upsert({
          where: { userId_groupId: { userId: o.userId, groupId: adminGroup } },
          create: { userId: o.userId, groupId: adminGroup, createdAt: o.createdAt },
          update: {},
        });
      }
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    rootId = await makeUser('rb_root');
    await makeAdministrator(prisma, 'rb_root');
    root2Id = await makeUser('rb_root2');
    await makeAdministrator(prisma, 'rb_root2');
    modId = await makeUser('rb_mod');
    await addToGroup(modId, 'Moderators');
    plainId = await makeUser('rb_plain');
    await makeUser('rb_other');
    listAId = await makeUser('rb_list_a');
    await makeUser('rb_list_b');
    moderatorsId = await groupId('Moderators');
    adminsId = await groupId('Administrators');

    root = await sessionFor(app, prisma, 'rb_root');
    root2 = await sessionFor(app, prisma, 'rb_root2');
    mod = await sessionFor(app, prisma, 'rb_mod');
    plain = await sessionFor(app, prisma, 'rb_plain');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('permissions on the session and the catalog', () => {
    it('gives /auth/me the sorted permissions and no role', async () => {
      const admin = await get('/api/auth/me', root).expect(200);
      expect(admin.body.user.permissions).toEqual([...ALL_PERMISSIONS].sort());
      expect(admin.body.user).not.toHaveProperty('role');

      const moderator = await get('/api/auth/me', mod).expect(200);
      expect(moderator.body.user.permissions).toEqual([...MODERATOR_KEYS].sort());

      const ordinary = await get('/api/auth/me', plain).expect(200);
      expect(ordinary.body.user.permissions).toEqual([]);
    });

    it('lists the catalog and the caller\'s own permissions on /admin/permissions', async () => {
      const res = await get('/api/admin/permissions', mod).expect(200);
      expect(res.body.catalog).toHaveLength(ALL_PERMISSIONS.length);
      expect(res.body.catalog[0]).toEqual(expect.objectContaining({ key: 'admin.access', area: 'general' }));
      expect(res.body.mine).toEqual([...MODERATOR_KEYS].sort());
    });

    it('answers 401 without a session and 403 for an account with no permissions', async () => {
      await get('/api/admin/permissions').expect(401);
      const denied = await get('/api/admin/permissions', plain).expect(403);
      expect(denied.body.message).toBe('Missing permission: admin.access');
    });
  });

  describe('groups', () => {
    it('lets a moderator read groups only with groups.read: they do not have it, so 403', async () => {
      const denied = await get('/api/admin/groups', mod).expect(403);
      expect(denied.body.message).toBe('Missing permission: groups.read');
    });

    it('lists groups paginated, with the system group and member counts', async () => {
      const page = await get('/api/admin/groups?page=1&pageSize=1', root).expect(200);
      expect(page.body).toMatchObject({ page: 1, pageSize: 1 });
      expect(page.body.items).toHaveLength(1);
      expect(page.body.total).toBeGreaterThanOrEqual(2);

      const all = await get('/api/admin/groups?pageSize=100', root).expect(200);
      const admins = all.body.items.find((g: { name: string }) => g.name === 'Administrators');
      expect(admins).toMatchObject({ system: true, permissions: [...ALL_PERMISSIONS].sort() });
      expect(admins.memberCount).toBeGreaterThanOrEqual(2);
      const moderators = all.body.items.find((g: { name: string }) => g.name === 'Moderators');
      expect(moderators).toMatchObject({ system: false, permissions: [...MODERATOR_KEYS].sort() });
    });

    it('validates the page query: page 0, pageSize 0 and pageSize 101 are 400', async () => {
      await get('/api/admin/groups?page=0', root).expect(400);
      await get('/api/admin/groups?pageSize=0', root).expect(400);
      await get('/api/admin/groups?pageSize=101', root).expect(400);
    });

    it("refuses a moderator creating a group with users.delete (403, groups.manage is checked first) and writes nothing", async () => {
      const res = await post('/api/admin/groups', mod, { name: 'RB Wreckers', permissions: ['users.delete'] }).expect(403);
      expect(res.body.message).toBe('Missing permission: groups.manage');
      expect(await prisma.permissionGroup.count({ where: { name: 'RB Wreckers' } })).toBe(0);
    });

    it('refuses a groups.manage holder creating a group with permissions they lack (403, the grant check)', async () => {
      await prisma.permissionGroup.create({
        data: { name: 'RB Group Only', description: '', permissions: { create: [{ permission: 'groups.read' }, { permission: 'groups.manage' }] } },
      });
      const managerId = await makeUser('rb_group_only');
      await addToGroup(managerId, 'RB Group Only');
      const manager = await sessionFor(app, prisma, 'rb_group_only');
      const res = await post('/api/admin/groups', manager, { name: 'RB Wreckers', permissions: ['users.delete'] }).expect(403);
      expect(res.body.message).toBe("You can't grant permissions you don't have: users.delete, users.read");
      expect(await prisma.permissionGroup.count({ where: { name: 'RB Wreckers' } })).toBe(0);
    });

    it('creates a group, adds the implied reads and says which it added', async () => {
      const res = await post('/api/admin/groups', root, {
        name: 'RB Support',
        description: 'Helpers',
        permissions: ['users.ban', 'users.edit'],
      }).expect(201);
      expect(res.body).toMatchObject({ name: 'RB Support', system: false, memberCount: 0 });
      expect(res.body.permissions).toEqual(['users.ban', 'users.edit', 'users.read']);
      expect(res.body.impliedAdded).toEqual(['users.read']);
    });

    it('refuses a duplicate name in any case (409), a short name (400) and an unknown permission (400)', async () => {
      await post('/api/admin/groups', root, { name: 'rb support', permissions: [] }).expect(409);
      await post('/api/admin/groups', root, { name: 'x', permissions: [] }).expect(400);
      await post('/api/admin/groups', root, { name: 'RB Typos', permissions: ['users.bann'] }).expect(400);
    });

    it('refuses a group named like the system group, in any case', async () => {
      await post('/api/admin/groups', root, { name: 'administrators', permissions: [] }).expect(409);
    });

    it('renames and redescribes a custom group; refuses to rename the system group (400)', async () => {
      const support = (await prisma.permissionGroup.findUniqueOrThrow({ where: { name: 'RB Support' }, select: { id: true } })).id;
      const renamed = await patch(`/api/admin/groups/${support}`, root, { name: 'RB Helpers', description: 'Hands' }).expect(200);
      expect(renamed.body).toMatchObject({ name: 'RB Helpers', description: 'Hands' });
      await patch(`/api/admin/groups/${adminsId}`, root, { name: 'Owners' }).expect(400);
    });

    it('replaces permissions, adds implied reads, and refuses the system group (400)', async () => {
      const helpers = await groupId('RB Helpers');
      const res = await put(`/api/admin/groups/${helpers}/permissions`, root, {
        permissions: ['users.ban', 'results.delete'],
      }).expect(200);
      expect(res.body.permissions).toEqual(['results.delete', 'results.read', 'users.ban', 'users.read']);
      expect(res.body.impliedAdded).toEqual(['results.read']);

      const system = await put(`/api/admin/groups/${adminsId}/permissions`, root, { permissions: [] }).expect(400);
      expect(system.body.message).toBe('The Administrators group always has every permission');
    });

    it('stops a group manager without users.ban from adding users.ban to a group (403)', async () => {
      const managers = await prisma.permissionGroup.create({
        data: { name: 'RB Managers', description: '', permissions: { create: [{ permission: 'groups.read' }, { permission: 'groups.manage' }] } },
      });
      const managerId = await makeUser('rb_manager');
      await addToGroup(managerId, 'RB Managers');
      const manager = await sessionFor(app, prisma, 'rb_manager');

      const denied = await put(`/api/admin/groups/${managers.id}/permissions`, manager, {
        permissions: ['groups.manage', 'groups.read', 'users.ban'],
      }).expect(403);
      expect(denied.body.message).toContain('users.ban');
      const allowed = await put(`/api/admin/groups/${managers.id}/permissions`, manager, {
        permissions: ['groups.manage', 'groups.read'],
      }).expect(200);
      expect(allowed.body.permissions).toEqual(['groups.manage', 'groups.read']);
    });

    it('shows a group with its first members (name, suspension)', async () => {
      const helpers = await groupId('RB Helpers');
      await put(`/api/admin/groups/${helpers}/members/${plainId}`, root).expect(200);
      const detail = await get(`/api/admin/groups/${helpers}`, root).expect(200);
      expect(detail.body.members).toEqual([expect.objectContaining({ id: plainId, name: 'rb_plain', bannedAt: null })]);
      await get(`/api/admin/groups/${adminsId}`, mod).expect(403);
    });

    it('deletes a custom group and its memberships; the system group gives 400', async () => {
      const helpers = await groupId('RB Helpers');
      await del(`/api/admin/groups/${helpers}`, root).expect(200, { ok: true });
      expect(await prisma.userGroup.count({ where: { groupId: helpers } })).toBe(0);
      await del(`/api/admin/groups/${adminsId}`, root).expect(400);
      await del(`/api/admin/groups/${helpers}`, root).expect(404);
    });
  });

  describe('group membership', () => {
    it('refuses a moderator adding themselves to Administrators (403): they lack users.groups', async () => {
      const denied = await put(`/api/admin/groups/${adminsId}/members/${modId}`, mod).expect(403);
      expect(denied.body.message).toBe('Missing permission: users.groups');
      expect(await prisma.userGroup.count({ where: { groupId: adminsId, userId: modId } })).toBe(0);
    });

    it('refuses a membership manager (users.groups) adding themselves to Administrators: the grant check names what they lack', async () => {
      await prisma.permissionGroup.create({
        data: { name: 'RB Members', description: '', permissions: { create: [{ permission: 'users.groups' }, { permission: 'users.read' }] } },
      });
      const memberId = await makeUser('rb_members_only');
      await addToGroup(memberId, 'RB Members');
      const manager = await sessionFor(app, prisma, 'rb_members_only');
      const denied = await put(`/api/admin/groups/${adminsId}/members/${memberId}`, manager).expect(403);
      // Holds users.groups and users.read (and so admin.access): the 14 other Administrators permissions are named, in catalog order.
      expect(denied.body.message).toBe(
        "You can't grant permissions you don't have: users.edit, users.ban, users.delete, groups.read, groups.manage, reports.read, reports.resolve, results.read, results.delete, quotes.read, quotes.manage, races.read, races.manage, audit.read",
      );
      expect(await prisma.userGroup.count({ where: { groupId: adminsId, userId: memberId } })).toBe(0);
    });

    it('lets an administrator add an ordinary user to Moderators, idempotently, and logs it once', async () => {
      const before = await prisma.adminAction.count({ where: { action: 'group_member_add', target: `user:${plainId}` } });
      await put(`/api/admin/groups/${moderatorsId}/members/${plainId}`, root).expect(200, {
        id: plainId,
        name: 'rb_plain',
        bannedAt: null,
      });
      await put(`/api/admin/groups/${moderatorsId}/members/${plainId}`, root).expect(200);
      const after = await prisma.adminAction.count({ where: { action: 'group_member_add', target: `user:${plainId}` } });
      expect(after - before).toBe(1);
      const me = await get('/api/auth/me', plain).expect(200);
      expect(me.body.user.permissions).toEqual([...MODERATOR_KEYS].sort());
    });

    it('refuses a moderator acting on an administrator (403), and removing the other administrators is refused too', async () => {
      await put(`/api/admin/groups/${moderatorsId}/members/${rootId}`, mod).expect(403);
      await del(`/api/admin/groups/${adminsId}/members/${rootId}`, mod).expect(403);
    });

    it('keeps the last Administrator: removal is refused (400), and removing yourself is fine when another remains', async () => {
      await asSoleAdministrator('rb_root', async () => {
        const res = await del(`/api/admin/groups/${adminsId}/members/${rootId}`, root).expect(400);
        expect(res.body.message).toBe('Administrators needs at least one member');
      });
      // Two administrators: the first may leave by itself, and the second is then the last.
      await del(`/api/admin/groups/${adminsId}/members/${rootId}`, root).expect(200, { ok: true });
      await put(`/api/admin/groups/${adminsId}/members/${rootId}`, root2).expect(200);
    });

    it('refuses to add a suspended user to a group (400)', async () => {
      const bannedId = await makeUser('rb_banned_join');
      await prisma.user.update({ where: { id: bannedId }, data: { bannedAt: new Date() } });
      const res = await put(`/api/admin/groups/${moderatorsId}/members/${bannedId}`, root).expect(400);
      expect(res.body.message).toBe("Suspended users can't be added to groups");
    });

    it('gives a concurrent duplicate add one row and one audit entry', async () => {
      const joinerId = await makeUser('rb_join_race');
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => put(`/api/admin/groups/${moderatorsId}/members/${joinerId}`, root)),
      );
      expect(responses.map((r) => r.status).every((s) => s === 200)).toBe(true);
      expect(await prisma.userGroup.count({ where: { groupId: moderatorsId, userId: joinerId } })).toBe(1);
      expect(await prisma.adminAction.count({ where: { action: 'group_member_add', target: `user:${joinerId}` } })).toBe(1);
    });
  });

  describe('users', () => {
    it('lets a moderator ban an ordinary user, but not an administrator (403), and not themselves (400)', async () => {
      const otherId = (await prisma.user.findUniqueOrThrow({ where: { nameLower: 'rb_other' }, select: { id: true } })).id;
      const banned = await post(`/api/admin/users/${otherId}/ban`, mod, { reason: 'spam' }).expect(200);
      expect(banned.body).toMatchObject({ id: otherId, name: 'rb_other' });
      expect(typeof banned.body.bannedAt).toBe('string');
      await post(`/api/admin/users/${otherId}/unban`, mod).expect(200);

      await post(`/api/admin/users/${rootId}/ban`, mod, { reason: 'x' }).expect(403);
      const self = await post(`/api/admin/users/${modId}/ban`, mod, { reason: 'x' }).expect(400);
      expect(self.body.message).toBe("You can't suspend your own account");
    });

    it('refuses banning an administrator with 400, even for another administrator', async () => {
      const res = await post(`/api/admin/users/${root2Id}/ban`, root, { reason: 'x' }).expect(400);
      expect(res.body.message).toBe("Administrators can't be banned");
    });

    it('keeps the name-based ban routes as aliases', async () => {
      await post('/api/admin/users/by-name/rb_other/ban', root, { reason: 'alias' }).expect(200);
      await post('/api/admin/users/by-name/rb_other/unban', root).expect(200);
      await post('/api/admin/users/by-name/nobody_at_all/ban', root, { reason: 'x' }).expect(404);
    });

    it('lists users with email and group info, filtered and paged', async () => {
      const all = await get('/api/admin/users?q=rb_list_&sort=name&order=asc&pageSize=1', root).expect(200);
      expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(all.body.items).toHaveLength(1);
      expect(all.body.items[0]).toEqual({
        id: expect.any(Number),
        name: 'rb_list_a',
        email: 'rb_list_a@example.com',
        createdAt: expect.any(String),
        bannedAt: null,
        groups: [],
        resultCount: 0,
      });
      expect(all.body.items[0]).not.toHaveProperty('tokenVersion');
      expect(all.body.items[0]).not.toHaveProperty('passwordHash');

      const second = await get('/api/admin/users?q=RB_LIST_&sort=name&order=asc&pageSize=1&page=2', root).expect(200);
      expect(second.body.items[0].name).toBe('rb_list_b');

      await put(`/api/admin/users/${listAId}/groups`, root, { groupIds: [moderatorsId] }).expect(200);
      const inGroup = await get(`/api/admin/users?group=${moderatorsId}&q=rb_list_`, root).expect(200);
      expect(inGroup.body.items.map((u: { name: string }) => u.name)).toEqual(['rb_list_a']);
      expect(inGroup.body.items[0].groups).toEqual([{ id: moderatorsId, name: 'Moderators' }]);

      const banned = await get('/api/admin/users?banned=true&q=rb_', root).expect(200);
      expect(banned.body.items.every((u: { bannedAt: string | null }) => u.bannedAt !== null)).toBe(true);
      await get('/api/admin/users?banned=maybe', root).expect(400);
      await get('/api/admin/users?sort=email', root).expect(400);
    });

    it('sorts by result count, newest account first by default', async () => {
      await get('/api/admin/users?sort=results&order=desc', root).expect(200);
      const newest = await get('/api/admin/users?q=rb_&pageSize=1', root).expect(200);
      expect(newest.body.items[0].name).toBe('rb_join_race');
    });

    it('shows the detail: effective permissions, stats and recent activity, but no tokenVersion', async () => {
      await prisma.result.create({
        data: {
          userId: plainId,
          mode: 'words', mode2: '100', language: 'en', wpm: 80, rawWpm: 85, accuracy: 97, consistency: 90,
          durationMs: 60_000, correctChars: 400, incorrectChars: 5, extraChars: 0, missedChars: 0,
          punctuation: false, numbers: false,
        },
      });
      await put(`/api/admin/users/${plainId}/groups`, root, { groupIds: [moderatorsId] }).expect(200);
      const detail = await get(`/api/admin/users/${plainId}`, mod).expect(200);
      expect(detail.body).toMatchObject({
        name: 'rb_plain',
        banReason: null,
        effectivePermissions: [...MODERATOR_KEYS].sort(),
        stats: { tests: 1, bestWpm: 80, lastResultAt: expect.any(String) },
        recentResults: [expect.objectContaining({ wpm: 80, rawWpm: 85 })],
        reportsReceived: [],
        reportsMade: [],
      });
      expect(detail.body).not.toHaveProperty('tokenVersion');
      expect(detail.body.groups).toEqual([{ id: moderatorsId, name: 'Moderators' }]);

      const ordinary = await sessionFor(app, prisma, 'rb_other');
      await get(`/api/admin/users/${plainId}`, ordinary).expect(403);
      await get('/api/admin/users/999999', root).expect(404);
    });

    it('renames a user (409 on a taken name) and ends their sessions', async () => {
      const renameId = await makeUser('rb_rename_me');
      const oldSession = await sessionFor(app, prisma, 'rb_rename_me');
      await get('/api/auth/me', oldSession).expect(200);

      const renamed = await patch(`/api/admin/users/${renameId}`, root, { name: 'rb_renamed' }).expect(200);
      expect(renamed.body).toMatchObject({ id: renameId, name: 'rb_renamed' });
      await get('/api/auth/me', oldSession).expect(401);

      await patch(`/api/admin/users/${renameId}`, root, { name: 'RB_OTHER' }).expect(409);
      await patch(`/api/admin/users/${renameId}`, root, { name: 'no' }).expect(400);
      await patch(`/api/admin/users/${renameId}`, mod, { name: 'rb_nope' }).expect(403);
    });

    it('revokes every session of a user, and the caller may revoke their own', async () => {
      const revokeId = await makeUser('rb_revoke_me');
      const session = await sessionFor(app, prisma, 'rb_revoke_me');
      await post(`/api/admin/users/${revokeId}/revoke-sessions`, root).expect(200, { ok: true });
      await get('/api/auth/me', session).expect(401);

      const again = await sessionFor(app, prisma, 'rb_root2');
      await post(`/api/admin/users/${root2Id}/revoke-sessions`, root2).expect(200, { ok: true });
      await get('/api/auth/me', again).expect(401);
      root2 = await sessionFor(app, prisma, 'rb_root2');
    });

    it('replaces a user\'s groups: a moderator cannot (403), an administrator can, and the last Administrator is kept', async () => {
      await put(`/api/admin/users/${plainId}/groups`, mod, { groupIds: [] }).expect(403);

      const res = await put(`/api/admin/users/${plainId}/groups`, root, { groupIds: [] }).expect(200);
      expect(res.body.groups).toEqual([]);
      expect(await prisma.userGroup.count({ where: { userId: plainId } })).toBe(0);

      await put(`/api/admin/users/${plainId}/groups`, root, { groupIds: [999999] }).expect(400);

      await asSoleAdministrator('rb_root', async () => {
        const refused = await put(`/api/admin/users/${rootId}/groups`, root, { groupIds: [] }).expect(400);
        expect(refused.body.message).toBe('Administrators needs at least one member');
      });
    });

    it('logs a change of a user\'s groups, and refuses a moderator on it (they lack users.groups)', async () => {
      await put(`/api/admin/users/${plainId}/groups`, root, { groupIds: [moderatorsId] }).expect(200);
      const log = await prisma.adminAction.findFirst({
        where: { action: 'user_groups', target: `user:${plainId}` },
        orderBy: { id: 'desc' },
      });
      expect(log?.note).toBe(`{"added":[${moderatorsId}],"removed":[]}`);
      await put(`/api/admin/users/${plainId}/groups`, mod, { groupIds: [] }).expect(403);
    });

    it('deletes an account only when the typed name matches, and never yourself', async () => {
      const goneId = await makeUser('rb_gone');
      await del(`/api/admin/users/${goneId}`, root, { confirm: 'rb_GONE' }).expect(400);
      await del(`/api/admin/users/${goneId}`, mod, { confirm: 'rb_gone' }).expect(403);
      await del(`/api/admin/users/${rootId}`, root, { confirm: 'rb_root' }).expect(400);
      await del(`/api/admin/users/${goneId}`, root, { confirm: 'rb_gone' }).expect(200, { ok: true });
      await get(`/api/admin/users/${goneId}`, root).expect(404);
      expect(await prisma.adminAction.count({ where: { action: 'user_delete', target: `user:${goneId}` } })).toBe(1);
    });

    it('deletes an administrator while others remain, and refuses to delete yourself', async () => {
      const lastId = await makeUser('rb_last_admin');
      await makeAdministrator(prisma, 'rb_last_admin');
      // An administrator can only reach the last-Administrator rule through themselves, and self-deletion is refused first.
      const self = await del(`/api/admin/users/${rootId}`, root, { confirm: 'rb_root' }).expect(400);
      expect(self.body.message).toBe("You can't delete your own account from the admin panel");
      await del(`/api/admin/users/${lastId}`, root, { confirm: 'rb_last_admin' }).expect(200);
    });
  });

  describe('suspended targets keep their rank', () => {
    it("refuses to unsuspend, rename, sign out or delete a suspended user who holds permissions the actor lacks", async () => {
      // The target holds groups.manage on top of the actor's user powers.
      const strong = await prisma.permissionGroup.create({
        data: {
          name: 'rb_strong',
          permissions: { create: ['users.read', 'users.ban', 'users.edit', 'users.delete', 'groups.read', 'groups.manage'].map((permission) => ({ permission })) },
        },
        select: { id: true },
      });
      const managers = await prisma.permissionGroup.create({
        data: {
          name: 'rb_user_managers',
          permissions: { create: ['users.read', 'users.ban', 'users.edit', 'users.delete'].map((permission) => ({ permission })) },
        },
        select: { id: true },
      });
      const targetId = await makeUser('rb_strong_target');
      const actorId = await makeUser('rb_user_manager');
      await prisma.userGroup.create({ data: { userId: targetId, groupId: strong.id } });
      await prisma.userGroup.create({ data: { userId: actorId, groupId: managers.id } });
      const actor = await sessionFor(app, prisma, 'rb_user_manager');

      // Not suspended: the actor is refused (control).
      await post(`/api/admin/users/${targetId}/ban`, actor, { reason: 'test' }).expect(403);
      // An administrator suspends the target.
      await post(`/api/admin/users/${targetId}/ban`, root, { reason: 'test' }).expect(200);

      // Suspended: still refused for every action.
      await post(`/api/admin/users/${targetId}/unban`, actor).expect(403);
      await patch(`/api/admin/users/${targetId}`, actor, { name: 'rb_renamed' }).expect(403);
      await post(`/api/admin/users/${targetId}/revoke-sessions`, actor).expect(403);
      await del(`/api/admin/users/${targetId}`, actor, { confirm: 'rb_strong_target' }).expect(403);

      const detail = await get(`/api/admin/users/${targetId}`, root).expect(200);
      expect(detail.body.effectivePermissions).toEqual([]);
      expect(detail.body.heldPermissions).toEqual(expect.arrayContaining(['groups.manage']));
      expect(await prisma.user.findUnique({ where: { id: targetId }, select: { name: true } })).toEqual({ name: 'rb_strong_target' });
    });
  });

  describe('audit and the CLI-free rules', () => {
    it('lets a moderator read the audit log (audit.read), and writes group and user actions with the admin named', async () => {
      const actions = await get('/api/admin/actions?pageSize=100', mod).expect(200);
      const kinds = actions.body.items.map((a: { action: string }) => a.action);
      expect(kinds).toEqual(expect.arrayContaining(['group_create', 'group_permissions', 'group_member_add', 'user_groups']));
      expect(actions.body.items.find((a: { action: string }) => a.action === 'group_create')).toMatchObject({ adminName: 'rb_root' });
      const other = await sessionFor(app, prisma, 'rb_other');
      await get('/api/admin/actions', other).expect(403);
    });
  });
});
