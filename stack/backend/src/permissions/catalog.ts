/**
 * The permission catalog. Keys are fixed in code; groups in the database hold a set of these keys.
 * The backend checks exact keys. Implied reads are added when a group is saved (see impliedReads).
 */
export const PERMISSIONS = {
  'admin.access':     { area: 'general',  description: 'Open the admin panel and see the dashboard' },
  'users.read':       { area: 'users',    description: 'List and view users, including email' },
  'users.edit':       { area: 'users',    description: 'Rename users and sign them out everywhere' },
  'users.ban':        { area: 'users',    description: 'Suspend and unsuspend users' },
  'users.delete':     { area: 'users',    description: 'Delete user accounts' },
  'users.groups':     { area: 'users',    description: "Change a user's groups" },
  'users.security':   { area: 'users',    description: "Turn off a user's two-factor authentication" },
  'groups.read':      { area: 'groups',   description: 'View groups, members and the permission matrix' },
  'groups.manage':    { area: 'groups',   description: 'Create, edit and delete groups and their permissions' },
  'reports.read':     { area: 'reports',  description: 'View reports' },
  'reports.resolve':  { area: 'reports',  description: 'Resolve and dismiss reports' },
  'results.read':     { area: 'results',  description: 'Search all results' },
  'results.delete':   { area: 'results',  description: 'Delete results' },
  'quotes.read':      { area: 'quotes',   description: 'View quotes in the admin panel' },
  'quotes.manage':    { area: 'quotes',   description: 'Add, edit and delete quotes' },
  'races.read':       { area: 'races',    description: 'View live race rooms' },
  'races.manage':     { area: 'races',    description: 'Close race rooms' },
  'announcements.manage': { area: 'announcements', description: 'Create, edit and delete site announcements' },
  'events.manage':    { area: 'events',   description: 'Create, edit and delete typing events' },
  'audit.read':       { area: 'audit',    description: 'View the audit log' },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type PermissionArea = (typeof PERMISSIONS)[Permission]['area'];

/** One row of the catalog as the API lists it. */
export interface CatalogEntry {
  key: Permission;
  area: PermissionArea;
  description: string;
}

export const ADMIN_ACCESS: Permission = 'admin.access';

/** Every catalog key, in catalog order. */
export const ALL_PERMISSIONS: readonly Permission[] = Object.keys(PERMISSIONS) as Permission[];

export const CATALOG: readonly CatalogEntry[] = ALL_PERMISSIONS.map((key) => ({
  key,
  area: PERMISSIONS[key].area,
  description: PERMISSIONS[key].description,
}));

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/**
 * The `<area>.read` keys that a write permission needs in the UI, e.g. users.ban -> users.read.
 * Only keys that exist in the catalog are returned. A read key implies nothing.
 */
export function impliedReads(keys: readonly Permission[]): Permission[] {
  const out = new Set<Permission>();
  for (const key of keys) {
    const read = `${PERMISSIONS[key].area}.read`;
    if (key !== read && isPermission(read)) out.add(read);
  }
  return [...out];
}
