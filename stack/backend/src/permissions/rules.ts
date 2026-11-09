/**
 * Pure permission rules, shared by the API services, the guard and the CLI. No framework or database
 * imports here, so every rule can be unit tested directly.
 */
import { ADMIN_ACCESS, ALL_PERMISSIONS, impliedReads, isPermission, type Permission } from './catalog';

export const ADMINISTRATORS_GROUP = 'Administrators';

export const CANNOT_ACT_ON = "You can't manage a user with permissions you don't have";
export const LAST_ADMINISTRATOR = 'Administrators needs at least one member';
export const ADMINISTRATORS_ALL_PERMISSIONS = 'The Administrators group always has every permission';

/** A group as the rules see it: the stored rows, plus whether it is the protected system group. */
export interface GroupFacts {
  name: string;
  system: boolean;
  /** Stored permission keys. Unknown keys are ignored here. */
  permissions: readonly string[];
}

export function isAdministrators(group: Pick<GroupFacts, 'name' | 'system'>): boolean {
  return group.system && group.name === ADMINISTRATORS_GROUP;
}

/** The catalog keys a group grants. Administrators always grants every catalog key, whatever its rows say. */
export function permissionsOfGroup(group: GroupFacts): Set<Permission> {
  if (isAdministrators(group)) return new Set(ALL_PERMISSIONS);
  return new Set(group.permissions.filter(isPermission));
}

/**
 * The effective permissions of a user. Banned users have none. Any permission other than admin.access
 * also grants admin.access, so a holder of any permission can open the admin panel.
 */
export function resolveEffective(groups: readonly GroupFacts[], banned: boolean): Set<Permission> {
  const out = new Set<Permission>();
  if (banned) return out;
  for (const group of groups) for (const p of permissionsOfGroup(group)) out.add(p);
  if (out.size > 0) out.add(ADMIN_ACCESS);
  return out;
}

/** The keys that are in `required` but not in `held`, in the order given. */
export function missingPermissions(held: ReadonlySet<Permission>, required: readonly Permission[]): Permission[] {
  return required.filter((p) => !held.has(p));
}

/** True when every permission in `subset` is also in `superset`. */
export function isSubset<T>(subset: ReadonlySet<T>, superset: ReadonlySet<T>): boolean {
  for (const p of subset) if (!superset.has(p)) return false;
  return true;
}

/** assertCanActOn: the target's permissions must all be held by the actor. Null when allowed. */
export function actOnProblem(actor: ReadonlySet<Permission>, target: ReadonlySet<Permission>): string | null {
  return isSubset(target, actor) ? null : CANNOT_ACT_ON;
}

/** assertCanGrant: the actor must hold every permission. Returns the missing keys, empty when allowed. */
export function grantMissing(actor: ReadonlySet<Permission>, granted: readonly Permission[]): Permission[] {
  return missingPermissions(actor, granted);
}

/**
 * Normalises a requested permission list: duplicates out, implied reads added. `implied` names the
 * reads that were not in the request, so the API can say what it added.
 */
export function normalizePermissions(requested: readonly Permission[]): { permissions: Permission[]; implied: Permission[] } {
  const asked = new Set(requested);
  const implied = impliedReads([...asked]).filter((p) => !asked.has(p));
  const permissions = [...asked, ...implied].sort();
  return { permissions, implied };
}

/**
 * The last-Administrator rule. `memberIds` are the current members of Administrators; `removedIds` the users
 * about to leave it. True when at least one member would remain.
 */
export function keepsAnAdministrator(memberIds: readonly number[], removedIds: readonly number[]): boolean {
  const removed = new Set(removedIds);
  return memberIds.some((id) => !removed.has(id));
}
