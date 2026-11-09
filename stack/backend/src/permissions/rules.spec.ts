import { ADMIN_ACCESS, ALL_PERMISSIONS, CATALOG, impliedReads, isPermission, PERMISSIONS, type Permission } from './catalog';
import {
  actOnProblem,
  grantMissing,
  keepsAnAdministrator,
  normalizePermissions,
  permissionsOfGroup,
  resolveEffective,
  type GroupFacts,
} from './rules';

const set = (...keys: Permission[]) => new Set<Permission>(keys);
const group = (name: string, system: boolean, permissions: string[]): GroupFacts => ({ name, system, permissions });

const MODERATORS = [
  'admin.access', 'users.read', 'users.ban', 'reports.read', 'reports.resolve', 'results.read', 'results.delete', 'audit.read',
] as Permission[];

describe('catalog', () => {
  it('has exactly the 17 keys of the 2.4 spec, each with an area and a description', () => {
    expect(ALL_PERMISSIONS).toHaveLength(17);
    expect(CATALOG.map((c) => c.key)).toEqual(ALL_PERMISSIONS);
    for (const entry of CATALOG) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.area).toBe(PERMISSIONS[entry.key].area);
    }
  });

  it('recognises only catalog keys', () => {
    expect(isPermission('users.ban')).toBe(true);
    expect(isPermission('users.bann')).toBe(false);
    expect(isPermission('constructor')).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });
});

describe('impliedReads', () => {
  it('adds the <area>.read key for every write permission in an area that has one', () => {
    expect(impliedReads(['users.ban'])).toEqual(['users.read']);
    expect(impliedReads(['users.edit', 'users.delete', 'users.groups'])).toEqual(['users.read']);
    expect(impliedReads(['groups.manage'])).toEqual(['groups.read']);
    expect(impliedReads(['reports.resolve'])).toEqual(['reports.read']);
    expect(impliedReads(['results.delete'])).toEqual(['results.read']);
    expect(impliedReads(['quotes.manage'])).toEqual(['quotes.read']);
    expect(impliedReads(['races.manage'])).toEqual(['races.read']);
  });

  it('implies nothing for reads, for admin.access, or for an area without a read key', () => {
    expect(impliedReads(['users.read', 'audit.read', 'admin.access'])).toEqual([]);
  });

  it('gives each implied key once, however many keys imply it', () => {
    expect(impliedReads(['users.ban', 'users.edit', 'users.delete'])).toEqual(['users.read']);
  });
});

describe('normalizePermissions', () => {
  it('adds the implied reads, reports which were added, dedupes and sorts', () => {
    expect(normalizePermissions(['users.ban', 'users.ban', 'admin.access'])).toEqual({
      permissions: ['admin.access', 'users.ban', 'users.read'],
      implied: ['users.read'],
    });
  });

  it('reports nothing as implied when the read was asked for', () => {
    expect(normalizePermissions(['users.read', 'users.ban'])).toEqual({
      permissions: ['users.ban', 'users.read'],
      implied: [],
    });
  });
});

describe('permissionsOfGroup and resolveEffective', () => {
  it('gives Administrators the full catalog whatever its rows say, and an empty list gives nothing', () => {
    expect(permissionsOfGroup(group('Administrators', true, []))).toEqual(new Set(ALL_PERMISSIONS));
    expect(resolveEffective([group('Administrators', true, [])], false)).toEqual(new Set(ALL_PERMISSIONS));
    expect(resolveEffective([group('Moderators', false, [])], false)).toEqual(new Set());
  });

  it('does not treat a custom group named Administrators as the system group', () => {
    expect(permissionsOfGroup(group('Administrators', false, ['users.ban']))).toEqual(set('users.ban'));
  });

  it('is the union of the user groups', () => {
    const effective = resolveEffective(
      [group('Moderators', false, MODERATORS), group('Auditors', false, ['audit.read', 'results.read'])],
      false,
    );
    expect([...effective].sort()).toEqual([...new Set(MODERATORS)].sort());
  });

  it('gives the empty set to a banned user, whatever the groups', () => {
    expect(resolveEffective([group('Administrators', true, [])], true)).toEqual(new Set());
    expect(resolveEffective([group('Moderators', false, MODERATORS)], true)).toEqual(new Set());
  });

  it('ignores unknown keys stored in a group', () => {
    expect(resolveEffective([group('Odd', false, ['users.ban', 'made.up'])], false)).toEqual(
      new Set([ADMIN_ACCESS, 'users.ban']),
    );
  });

  it('grants admin.access to anyone who holds any permission, and to nobody otherwise', () => {
    expect(resolveEffective([group('Auditors', false, ['audit.read'])], false).has(ADMIN_ACCESS)).toBe(true);
    expect(resolveEffective([group('Empty', false, [])], false).has(ADMIN_ACCESS)).toBe(false);
  });
});

describe('the act-on rule (assertCanActOn)', () => {
  const moderator = resolveEffective([group('Moderators', false, MODERATORS)], false);
  const admin = resolveEffective([group('Administrators', true, [])], false);
  const ordinary = resolveEffective([], false);
  const bannedAdmin = resolveEffective([group('Administrators', true, [])], true);

  it('lets a moderator act on an ordinary user', () => {
    expect(actOnProblem(moderator, ordinary)).toBeNull();
  });

  it('refuses a moderator acting on an administrator, with the spec message', () => {
    expect(actOnProblem(moderator, admin)).toBe("You can't manage a user with permissions you don't have");
  });

  it('lets an administrator act on an administrator and on themselves (a subset of themselves)', () => {
    expect(actOnProblem(admin, admin)).toBeNull();
    expect(actOnProblem(moderator, moderator)).toBeNull();
  });

  it('compares sets only: a banned user has an empty effective set, so callers must pass the held set', () => {
    // PermissionsService.assertCanActOn passes the target's held permissions (ignoring the ban), so a
    // suspended administrator still outranks a moderator there. See permissions.service.spec.ts.
    expect(actOnProblem(moderator, bannedAdmin)).toBeNull();
    expect(actOnProblem(moderator, admin)).not.toBeNull();
  });

  it('refuses a target who holds a permission the actor lacks, even one permission', () => {
    const reader = resolveEffective([group('Readers', false, ['users.read'])], false);
    const editor = resolveEffective([group('Editors', false, ['users.read', 'users.edit'])], false);
    expect(actOnProblem(reader, editor)).not.toBeNull();
    expect(actOnProblem(editor, reader)).toBeNull();
  });
});

describe('the grant rule (assertCanGrant)', () => {
  const moderator = new Set<Permission>(MODERATORS);

  it('lets an actor grant what they hold, and nothing they lack', () => {
    expect(grantMissing(moderator, ['users.ban', 'audit.read'])).toEqual([]);
    expect(grantMissing(moderator, ['users.delete'])).toEqual(['users.delete']);
  });

  it('refuses a moderator adding themselves to Administrators (every permission)', () => {
    expect(grantMissing(moderator, ALL_PERMISSIONS)).toEqual(ALL_PERMISSIONS.filter((p) => !moderator.has(p)));
  });

  it('refuses a groups.manage holder without users.ban from adding users.ban to a group', () => {
    const manager = set('admin.access', 'groups.read', 'groups.manage');
    expect(grantMissing(manager, ['users.ban'])).toEqual(['users.ban']);
  });
});

describe('the last-Administrator rule', () => {
  it('needs one member to stay when a member leaves', () => {
    expect(keepsAnAdministrator([1], [1])).toBe(false);
    expect(keepsAnAdministrator([1, 2], [1])).toBe(true);
    expect(keepsAnAdministrator([1, 2], [1, 2])).toBe(false);
    expect(keepsAnAdministrator([], [])).toBe(false);
    expect(keepsAnAdministrator([1, 2, 3], [])).toBe(true);
  });
});
