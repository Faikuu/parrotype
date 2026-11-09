// The permission catalog mirrored from the backend (src/permissions/catalog.ts, docs/SPEC-2.4.md).
// Keep the keys in step with the server. The order here is the order of the matrix rows.

export const AREAS = ['general', 'users', 'groups', 'reports', 'results', 'quotes', 'races', 'announcements', 'events', 'audit'] as const;
export type Area = (typeof AREAS)[number];

export const PERMISSION_CATALOG = [
  { key: 'admin.access', area: 'general' },
  { key: 'users.read', area: 'users' },
  { key: 'users.edit', area: 'users' },
  { key: 'users.ban', area: 'users' },
  { key: 'users.delete', area: 'users' },
  { key: 'users.groups', area: 'users' },
  { key: 'users.security', area: 'users' },
  { key: 'groups.read', area: 'groups' },
  { key: 'groups.manage', area: 'groups' },
  { key: 'reports.read', area: 'reports' },
  { key: 'reports.resolve', area: 'reports' },
  { key: 'results.read', area: 'results' },
  { key: 'results.delete', area: 'results' },
  { key: 'quotes.read', area: 'quotes' },
  { key: 'quotes.manage', area: 'quotes' },
  { key: 'races.read', area: 'races' },
  { key: 'races.manage', area: 'races' },
  { key: 'announcements.manage', area: 'announcements' },
  { key: 'events.manage', area: 'events' },
  { key: 'audit.read', area: 'audit' },
] as const satisfies readonly { key: string; area: Area }[];

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]['key'];

export const ALL_PERMISSIONS: readonly PermissionKey[] = PERMISSION_CATALOG.map((p) => p.key);

/** The area of a permission key, for grouping. */
export function areaOf(key: PermissionKey): Area {
  return PERMISSION_CATALOG.find((p) => p.key === key)?.area ?? 'general';
}

/** The i18n key suffix for a permission's description: `users.read` becomes `users_read`. */
export function descKey(key: string): string {
  return key.replace('.', '_');
}

/** A sidebar section. `perm` is what the user needs to see it; `admin.access` means any permission. */
export interface Section {
  id: 'dashboard' | 'users' | 'groups' | 'permissions' | 'reports' | 'results' | 'quotes' | 'races' | 'announcements' | 'events' | 'audit';
  path: string;
  perm: PermissionKey;
}

export const SECTIONS: readonly Section[] = [
  { id: 'dashboard', path: '/admin', perm: 'admin.access' },
  { id: 'users', path: '/admin/users', perm: 'users.read' },
  { id: 'groups', path: '/admin/groups', perm: 'groups.read' },
  { id: 'permissions', path: '/admin/permissions', perm: 'groups.read' },
  { id: 'reports', path: '/admin/reports', perm: 'reports.read' },
  { id: 'results', path: '/admin/results', perm: 'results.read' },
  { id: 'quotes', path: '/admin/quotes', perm: 'quotes.read' },
  { id: 'races', path: '/admin/races', perm: 'races.read' },
  { id: 'announcements', path: '/admin/announcements', perm: 'announcements.manage' },
  { id: 'events', path: '/admin/events', perm: 'events.manage' },
  { id: 'audit', path: '/admin/audit', perm: 'audit.read' },
];

/** The section a path belongs to: the dashboard only on its exact path, the others by prefix. */
export function activeSection(pathname: string, sections: readonly Section[] = SECTIONS): Section | undefined {
  return sections.find((s) =>
    s.path === '/admin' ? pathname === '/admin' : pathname === s.path || pathname.startsWith(`${s.path}/`),
  );
}
