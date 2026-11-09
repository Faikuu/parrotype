import { describe, expect, it } from 'vitest';
import {
  cellState,
  closeOver,
  diffCount,
  impliedReadOf,
  membershipBlock,
  permissionsByArea,
  withToggled,
  writesNeeding,
} from './permissionModel';
import type { PermissionKey } from './catalog';

const keys = (...k: string[]) => new Set(k as PermissionKey[]);

describe('closeOver', () => {
  it('adds the implied read for each write, and keeps unknown keys out', () => {
    expect([...closeOver(['users.ban', 'groups.manage', 'nope.key'])].sort()).toEqual(
      ['groups.manage', 'groups.read', 'users.ban', 'users.read'].sort(),
    );
  });

  it('adds nothing for a read permission', () => {
    expect([...closeOver(['audit.read'])]).toEqual(['audit.read']);
  });
});

describe('withToggled', () => {
  it('turning a write on also turns its implied read on', () => {
    expect([...withToggled(keys(), 'users.edit', true)].sort()).toEqual(['users.edit', 'users.read']);
  });

  it('turning a write off leaves the read in place', () => {
    expect([...withToggled(keys('users.edit', 'users.read'), 'users.edit', false)]).toEqual(['users.read']);
  });
});

describe('cellState', () => {
  const held = keys('admin.access', 'groups.manage', 'users.read', 'users.ban', 'audit.read', 'quotes.read');

  it('locks every cell of the system group', () => {
    const state = cellState({ draft: keys('audit.read'), held, system: true, key: 'audit.read' });
    expect(state).toEqual({ checked: true, disabled: true, reason: { kind: 'system' } });
  });

  it('locks a read that a checked write still needs', () => {
    const state = cellState({ draft: keys('users.ban', 'users.read'), held, system: false, key: 'users.read' });
    expect(state.disabled).toBe(true);
    expect(state.reason).toEqual({ kind: 'includedBy', by: 'users.ban' });
  });

  it('locks everything when the actor cannot manage groups', () => {
    const state = cellState({ draft: keys(), held: keys('audit.read'), system: false, key: 'audit.read' });
    expect(state.reason).toEqual({ kind: 'noPermission' });
  });

  it('needs the key and its implied read to turn a write on', () => {
    const state = cellState({ draft: keys(), held: keys('groups.manage', 'users.ban'), system: false, key: 'users.ban' });
    expect(state.disabled).toBe(true);
    expect(state.reason).toEqual({ kind: 'noPermission' });
  });

  it('lets the actor turn off a key they hold', () => {
    const state = cellState({ draft: keys('audit.read'), held, system: false, key: 'audit.read' });
    expect(state).toEqual({ checked: true, disabled: false, reason: null });
  });

  it('locks removing a key the actor does not hold', () => {
    const state = cellState({ draft: keys('races.manage', 'races.read'), held, system: false, key: 'races.manage' });
    expect(state.disabled).toBe(true);
  });
});

describe('membershipBlock', () => {
  const adminGroup = { system: true, permissions: ['audit.read'], memberCount: 1 };
  const everything = keys('users.groups', 'audit.read', 'users.read');

  it('needs users.groups', () => {
    expect(membershipBlock({ held: keys('audit.read'), group: adminGroup, isMember: false, target: { targetPerms: [], banned: false } })).toEqual({
      kind: 'noPermission',
    });
  });

  it('needs every permission of the group', () => {
    const group = { system: false, permissions: ['quotes.manage'], memberCount: 3 };
    expect(membershipBlock({ held: everything, group, isMember: false, target: { targetPerms: [], banned: false } })).toEqual({
      kind: 'cannotGrant',
    });
  });

  it('cannot act on a user with permissions the actor lacks', () => {
    const group = { system: false, permissions: [], memberCount: 3 };
    expect(membershipBlock({ held: everything, group, isMember: false, target: { targetPerms: ['races.manage'], banned: false } })).toEqual({
      kind: 'cannotActOn',
    });
  });

  it('refuses to add a suspended user but lets them be removed', () => {
    const group = { system: false, permissions: [], memberCount: 3 };
    expect(membershipBlock({ held: everything, group, isMember: false, target: { targetPerms: [], banned: true } })).toEqual({ kind: 'suspended' });
    expect(membershipBlock({ held: everything, group, isMember: true, target: { targetPerms: [], banned: true } })).toBeNull();
  });

  it('keeps the last Administrator', () => {
    expect(membershipBlock({ held: everything, group: adminGroup, isMember: true, target: { targetPerms: [], banned: false } })).toEqual({
      kind: 'lastAdmin',
    });
  });
});

describe('helpers', () => {
  it('diffCount counts the permissions that differ', () => {
    expect(diffCount(keys('a', 'b'), keys('b', 'c'))).toBe(2);
    expect(diffCount(new Set([1, 2]), new Set([1, 2]))).toBe(0);
  });

  it('impliedReadOf and writesNeeding agree', () => {
    expect(impliedReadOf('quotes.manage')).toBe('quotes.read');
    expect(writesNeeding('quotes.read', keys('quotes.manage', 'quotes.read'))).toEqual(['quotes.manage']);
  });

  it('groups the catalog by area in order, without empty areas', () => {
    const areas = permissionsByArea(['audit.read', 'admin.access', 'users.read']);
    expect(areas.map((a) => a.area)).toEqual(['general', 'users', 'audit']);
  });
});
