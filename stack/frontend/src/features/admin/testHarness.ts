// Shared fetch mock for the admin tests. Routes answer by method and path (without the /api prefix).
// A responder returns undefined to pass the request on to the next one.

export interface MockRequest {
  method: string;
  path: string;
  params: URLSearchParams;
  body: unknown;
}

export type Responder = (req: MockRequest) => { status?: number; body?: unknown } | undefined;

export interface MockMe {
  id?: number;
  name?: string;
  permissions: string[];
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Installs fetch. `me` is the signed-in user (null for anonymous: /auth/me answers 401). */
export function installApi(me: MockMe | null, responders: Responder[] = []) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    if (path === '/auth/me') {
      return me
        ? json({
            user: {
              id: me.id ?? 2,
              name: me.name ?? 'kea',
              email: 'kea@example.com',
              permissions: me.permissions,
              createdAt: '2026-10-01T10:00:00Z',
            },
          })
        : json({ message: 'Unauthorized' }, 401);
    }
    const req: MockRequest = { method, path, params: url.searchParams, body };
    for (const respond of responders) {
      const out = respond(req);
      if (out) return json(out.body ?? {}, out.status ?? 200);
    }
    return json({ message: `Unexpected ${method} ${path}` }, 500);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** The write requests (PUT, POST, PATCH, DELETE) the mock received, in order. */
export function writes(fn: { mock: { calls: unknown[][] } }): { method: string; path: string; body: unknown }[] {
  return fn.mock.calls
    .map(([input, init]) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      const raw = (init as RequestInit | undefined)?.body;
      return { method, path: url.pathname.replace(/^\/api/, ''), body: typeof raw === 'string' ? JSON.parse(raw) : undefined };
    })
    .filter((c) => c.method !== 'GET');
}

export const CATALOG_KEYS = [
  'admin.access',
  'users.read',
  'users.edit',
  'users.ban',
  'users.delete',
  'users.groups',
  'groups.read',
  'groups.manage',
  'reports.read',
  'reports.resolve',
  'results.read',
  'results.delete',
  'quotes.read',
  'quotes.manage',
  'races.read',
  'races.manage',
  'audit.read',
];

export const GROUPS = [
  {
    id: 1,
    name: 'Administrators',
    description: 'Everything',
    system: true,
    permissions: CATALOG_KEYS,
    memberCount: 2,
    updatedAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 2,
    name: 'Moderators',
    description: 'Handles reports',
    system: false,
    permissions: ['admin.access', 'users.read', 'users.ban', 'reports.read', 'reports.resolve', 'results.read', 'results.delete', 'audit.read'],
    memberCount: 4,
    updatedAt: '2026-10-02T10:00:00Z',
  },
  {
    id: 3,
    name: 'Viewers',
    description: 'Read only',
    system: false,
    permissions: ['admin.access', 'audit.read'],
    memberCount: 1,
    updatedAt: '2026-10-03T10:00:00Z',
  },
];

/** The paged shape of GET /admin/groups (one page holds up to 100 groups). */
export function groupsPage<T>(items: T[]) {
  return { items, total: items.length, page: 1, pageSize: 100 };
}
