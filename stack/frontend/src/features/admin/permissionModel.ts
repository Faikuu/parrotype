// Pure rules for who may change what. They mirror the server (PermissionsService.assertCanGrant,
// assertCanActOn, the last-Administrator rule) so the controls can be disabled up front. The server
// still decides: every failure shows its own message.
import { ALL_PERMISSIONS, areaOf, AREAS, type Area, type PermissionKey } from './catalog';

/** The write permissions and the read permission the UI adds with them (the server does the same on save). */
const IMPLIED_READ: Partial<Record<PermissionKey, PermissionKey>> = {
  'users.edit': 'users.read',
  'users.ban': 'users.read',
  'users.delete': 'users.read',
  'users.groups': 'users.read',
  'groups.manage': 'groups.read',
  'reports.resolve': 'reports.read',
  'results.delete': 'results.read',
  'quotes.manage': 'quotes.read',
  'races.manage': 'races.read',
};

export function impliedReadOf(key: PermissionKey): PermissionKey | undefined {
  return IMPLIED_READ[key];
}

/** A permission set with every implied read added. Groups are always stored and sent in this form. */
export function closeOver(keys: Iterable<string>): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  for (const key of keys) {
    const k = key as PermissionKey;
    if (!ALL_PERMISSIONS.includes(k)) continue; // unknown keys are ignored on read, as on the server
    out.add(k);
    const read = IMPLIED_READ[k];
    if (read) out.add(read);
  }
  return out;
}

/** Write permissions in `set` that need `read`. A read that one of these needs cannot be turned off. */
export function writesNeeding(read: PermissionKey, set: ReadonlySet<PermissionKey>): PermissionKey[] {
  return ALL_PERMISSIONS.filter((k) => set.has(k) && IMPLIED_READ[k] === read);
}

/** The set after turning `key` on or off. Turning it on adds its implied read as well. */
export function withToggled(draft: ReadonlySet<PermissionKey>, key: PermissionKey, on: boolean): Set<PermissionKey> {
  const next = new Set(draft);
  if (on) {
    next.add(key);
    const read = IMPLIED_READ[key];
    if (read) next.add(read);
  } else {
    next.delete(key);
  }
  return next;
}

/** The number of permissions that differ between two sets (what the save bar counts). */
export function diffCount<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  let n = 0;
  for (const k of a) if (!b.has(k)) n++;
  for (const k of b) if (!a.has(k)) n++;
  return n;
}

/** The exact set of keys to send, sorted so the request is stable. */
export function sortedKeys(set: ReadonlySet<string>): string[] {
  return [...set].sort();
}

/**
 * The actor's exact permission set (no admin.access wildcard). Grant rules use this, because the
 * server checks each key by name.
 */
export type HeldSet = ReadonlySet<string>;

export function holdsAll(held: HeldSet, keys: Iterable<string>): boolean {
  for (const k of keys) if (!held.has(k)) return false;
  return true;
}

export type CellReason =
  | { kind: 'system' }
  | { kind: 'noPermission' }
  | { kind: 'includedBy'; by: PermissionKey };

export interface CellState {
  checked: boolean;
  disabled: boolean;
  reason: CellReason | null;
}

/**
 * One checkbox in a group's permission column. `draft` is the group's closed set as it would be saved.
 * A cell is disabled when the group is the locked system group, when the actor lacks groups.manage,
 * when turning it on or off needs a permission the actor doesn't hold, or when it is a read that a
 * write in the same group still needs.
 */
export function cellState(opts: {
  draft: ReadonlySet<PermissionKey>;
  held: HeldSet;
  system: boolean;
  key: PermissionKey;
}): CellState {
  const { draft, held, system, key } = opts;
  const checked = draft.has(key);
  if (system) return { checked, disabled: true, reason: { kind: 'system' } };

  const lockedBy = writesNeeding(key, draft);
  if (checked && lockedBy.length > 0) {
    return { checked, disabled: true, reason: { kind: 'includedBy', by: lockedBy[0]! } };
  }

  if (!held.has('groups.manage')) return { checked, disabled: true, reason: { kind: 'noPermission' } };

  // Turning it on needs the key and its implied read. Turning it off needs the key itself.
  const needed = checked ? [key] : [key, IMPLIED_READ[key]].filter((k): k is PermissionKey => k !== undefined);
  if (!holdsAll(held, needed)) return { checked, disabled: true, reason: { kind: 'noPermission' } };

  return { checked, disabled: false, reason: null };
}

/** Area headers in matrix order, with the permissions in each area. */
export function permissionsByArea(keys: readonly PermissionKey[] = ALL_PERMISSIONS): { area: Area; keys: PermissionKey[] }[] {
  return AREAS.map((area) => ({ area, keys: keys.filter((k) => areaOf(k) === area) })).filter((g) => g.keys.length > 0);
}

export type MembershipReason =
  | { kind: 'noPermission' }
  | { kind: 'cannotGrant' }
  | { kind: 'cannotActOn' }
  | { kind: 'suspended' }
  | { kind: 'lastAdmin' };

/**
 * Whether a user's membership in one group can change. `targetPerms` is the target's effective set.
 * Mirrors PUT/DELETE /groups/:id/members/:userId and PUT /users/:id/groups.
 */
export function membershipBlock(opts: {
  held: HeldSet;
  group: { system: boolean; permissions: readonly string[]; memberCount: number };
  isMember: boolean;
  target: { targetPerms: readonly string[]; banned: boolean };
}): MembershipReason | null {
  const { held, group, isMember, target } = opts;
  if (!held.has('users.groups')) return { kind: 'noPermission' };
  if (!holdsAll(held, group.permissions)) return { kind: 'cannotGrant' };
  const targetPerms = new Set(target.targetPerms);
  for (const k of targetPerms) if (!held.has(k)) return { kind: 'cannotActOn' };
  if (!isMember && target.banned) return { kind: 'suspended' };
  if (isMember && group.system && group.memberCount <= 1) return { kind: 'lastAdmin' };
  return null;
}
