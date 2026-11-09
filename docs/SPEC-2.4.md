# ParroType 2.4 — permissions and admin panel

Earlier specs still hold, and the design rules are unchanged. No new npm packages.

This replaces the single `User.role` with **role-based access control**: a fixed permission catalog in code, permission groups in the database (CRUD), users in any number of groups, and a full admin panel for managing everything.

## Permission catalog (code, `src/permissions/catalog.ts`)
```ts
export const PERMISSIONS = {
  'admin.access':     { area: 'general',  description: 'Open the admin panel and see the dashboard' },
  'users.read':       { area: 'users',    description: 'List and view users, including email' },
  'users.edit':       { area: 'users',    description: 'Rename users and sign them out everywhere' },
  'users.ban':        { area: 'users',    description: 'Suspend and unsuspend users' },
  'users.delete':     { area: 'users',    description: 'Delete user accounts' },
  'users.groups':     { area: 'users',    description: "Change a user's groups" },
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
  'audit.read':       { area: 'audit',    description: 'View the audit log' },
} as const;
export type Permission = keyof typeof PERMISSIONS;
```
Rules:
- Any permission other than `admin.access` implies `admin.access` (the guard treats the user as having admin.access when they hold any permission).
- `*.manage`/`*.delete`/`*.edit`/`*.ban`/`*.resolve`/`*.groups` imply the matching `*.read` in the UI, but the backend checks the exact key. So group edits must keep `.read` alongside the write permissions: the API auto-adds the implied `.read` keys when saving a group's permissions, and says so in the response.

## Schema (template + 3 providers; one migration per provider, with a data migration)
```prisma
model PermissionGroup {
  id          Int      @id @default(autoincrement())
  name        String   @unique          // 2–40 chars
  description String   @default("")     // ≤ 200 ({{longText}} not needed)
  system      Boolean  @default(false)  // system groups can't be deleted or renamed
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  permissions GroupPermission[]
  members     UserGroup[]
}
model GroupPermission {
  groupId    Int
  permission String          // a catalog key; unknown keys are rejected on write and ignored on read
  group      PermissionGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@id([groupId, permission])
}
model UserGroup {
  userId    Int
  groupId   Int
  createdAt DateTime @default(now())
  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  group     PermissionGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@id([userId, groupId])
  @@index([groupId])
}
```
- **User**: remove `role`, and add `groups UserGroup[]`.
- **Data migration** (in the same migration, hand-written SQL per provider):
  - Create the system group **Administrators** (system = true, every catalog permission).
  - Create a non-system **Moderators** group (admin.access, users.read, users.ban, reports.read, reports.resolve, results.read, results.delete, audit.read).
  - Move every user with `role = 'admin'` into Administrators.
  - Then drop the `role` column.
  - SQLite needs the table-rebuild pattern for dropping a column (Prisma generates it; insert the data steps before the drop).
- `AdminAction.action` gains the values: `group_create`, `group_update`, `group_delete`, `group_permissions`, `group_member_add`, `group_member_remove`, `user_groups`, `user_rename`, `user_revoke_sessions`, `user_delete`, `quote_create`, `quote_update`, `quote_delete`, `race_close`.

## Backend
### Core (`src/permissions`)
- `PermissionsService`:
  - `effective(userId): Promise<Set<Permission>>`: the union of the user's groups' permissions. The Administrators group always resolves to the full catalog, whatever rows it has. Banned users get the empty set.
  - `has(userId, p)`.
  - `assertCanActOn(actorId, targetId)`: throws 403 "You can't manage a user with permissions you don't have" unless the target's effective permissions are a subset of the actor's. Acting on yourself is allowed only where an endpoint says so.
  - `assertCanGrant(actorId, permissions[])`: 403 unless the actor holds every one of them.
- `@RequirePermissions(...keys)` decorator + `PermissionsGuard`: it uses the verified session (readSessionUser), loads the effective permissions once per request (cache them on req), and returns 401 with no session, 403 when a permission is missing. It replaces AdminGuard. Every existing admin endpoint is switched to the matching permission.
- `GET /api/auth/me` and the PublicUser of `me` include `permissions: Permission[]` (sorted). `role` is removed from all responses.
- The CLI: `npm run admin -- grant <name>` adds the user to Administrators; `revoke <name>` removes them (and refuses to remove the last Administrator); `list` lists the Administrators. Plus `groups` lists the groups with member counts.
- Race identity and the ban checks are unchanged.

### Endpoints (all under `/api/admin`, JSON, zod-validated; list endpoints are paginated as `{ items, total, page, pageSize }` with `page ≥ 1`, `pageSize` 1–100, default 25)
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/permissions` | admin.access | The catalog `[{ key, area, description }]`, plus `mine: Permission[]` |
| GET | `/stats` | admin.access | `{ users: { total, new7d, banned }, results: { total, today, last7d }, reports: { open }, races: { rooms, players }, signupsByDay: [{date,count}] (30d), resultsByDay: [{date,count}] (30d) }` |
| GET | `/groups` | groups.read | Each with `{ id, name, description, system, permissions, memberCount, updatedAt }` |
| POST | `/groups` | groups.manage | `{ name, description?, permissions? }`. The actor must hold every permission granted (assertCanGrant). 409 on a duplicate name (case-insensitive). |
| GET | `/groups/:id` | groups.read | The group + its first 100 members `{ id, name, bannedAt }` |
| PATCH | `/groups/:id` | groups.manage | `{ name?, description? }`. System groups can't be renamed (400). |
| PUT | `/groups/:id/permissions` | groups.manage | `{ permissions }` replaces the set (implied reads auto-added). The actor must hold every permission being **added or removed** (you can't strip a permission you don't have). System groups → 400 "The Administrators group always has every permission". |
| DELETE | `/groups/:id` | groups.manage | System → 400. The actor must hold all the group's permissions. Memberships cascade. |
| PUT | `/groups/:id/members/:userId` | users.groups | Idempotent. The actor must hold all the group's permissions (assertCanGrant) and be able to act on the target (assertCanActOn). The target can't be banned (400). |
| DELETE | `/groups/:id/members/:userId` | users.groups | The same checks. You can't remove the last member of Administrators (400 "Administrators needs at least one member"). Removing yourself is allowed except for that rule. |
| GET | `/users` | users.read | `?q=` (name/email contains, case-insensitive), `banned=true\|false`, `group=<id>`, `sort=created\|name\|results`, `order=asc\|desc`. Items: `{ id, name, email, createdAt, bannedAt, groups: [{id,name}], resultCount }` |
| GET | `/users/:id` | users.read | The detail: the above + `banReason`, `tokenVersion` not exposed, `effectivePermissions`, `stats: { tests, bestWpm, lastResultAt }`, `recentResults` (10), `reportsReceived` (10), `reportsMade` (10) |
| PATCH | `/users/:id` | users.edit | `{ name }` (the same regex as register, unique case-insensitive → 409); assertCanActOn; bumps tokenVersion (since the JWT carries the name) |
| POST | `/users/:id/revoke-sessions` | users.edit | Bumps tokenVersion; assertCanActOn; allowed on yourself (it signs you out) |
| POST | `/users/:id/ban` · `/unban` | users.ban | `{ reason }` for ban. assertCanActOn; not yourself. Emits the existing banned event. (Keep the old `/users/:name/ban` routes as aliases or remove them and update the frontend; pick one consistently.) |
| PUT | `/users/:id/groups` | users.groups | `{ groupIds }` replaces the memberships; assertCanActOn + assertCanGrant for every group added or removed; the last-Administrator rule applies |
| DELETE | `/users/:id` | users.delete | `{ confirm: <name> }` must equal the user's name; assertCanActOn; not yourself; the last-Administrator rule applies |
| GET | `/results` | results.read | `?user=<name>`, `mode`, `language`, `suspicious=true` (wpm ≥ 180 and consistency < 40, or wpm > rawWpm, or accuracy < 75 with wpm ≥ 150), `sort=created\|wpm`, paginated. Items include the user name. |
| DELETE | `/results/:id` | results.delete | (existing) |
| GET | `/reports` …, the resolve/dismiss routes | reports.read / reports.resolve | (existing, now paginated) |
| GET | `/quotes` | quotes.read | `?language=&q=`, paginated |
| POST | `/quotes` | quotes.manage | `{ language, text (10–600), source (2–120) }`; computes length |
| PATCH | `/quotes/:id` | quotes.manage | partial |
| DELETE | `/quotes/:id` | quotes.manage | refuses (400) if it would leave a language with no quotes |
| GET | `/races` | races.read | The live rooms from RoomService: `{ id, language, status, players: [{name,isGuest,connected,progress}], createdAt, lastActivity }` |
| DELETE | `/races/:id` | races.manage | Closes the room: members get the error "This race was closed by a moderator" and are disconnected |
| GET | `/actions` | audit.read | `?action=&admin=<name>&target=` paginated, newest first |

Every write is in a transaction with its AdminAction row (the note holds a short JSON-ish summary such as `{"added":["users.ban"],"removed":[]}`), using conditional writes where a race could duplicate effects.

### Tests
- Unit tests:
  - effective permissions: a union, the Administrators wildcard, banned → empty.
  - assertCanActOn / assertCanGrant matrices.
  - implied reads.
  - The last-Administrator rule.
  - Suspicious-result predicate.
- e2e:
  - A Moderator can ban a normal user but not an Administrator (403).
  - A Moderator can't create a group with users.delete (403).
  - A Moderator can't add themselves to Administrators (403).
  - A groups.manage holder without users.ban can't add users.ban to a group (403).
  - The last Administrator can't be removed (400).
  - Deleting a non-system group works, and deleting the system group gives 400.
  - Rename bumps sessions.
  - Quote CRUD plus the last-quote guard.
  - Race close reaches its members.
  - The paginated lists.
  - /auth/me returns permissions.
  - The data migration moves an existing admin into Administrators: create a user with the old schema state in a unit-level migration test if feasible, or verify by applying the migrations to a DB seeded at the previous migration (use `prisma migrate deploy` to the previous migration, insert an admin, then deploy the rest).
- All 3 engines.

## Frontend (`src/features/admin`)
- **Layout**:
  - `/admin/*`, lazy. It requires `permissions.length > 0` (from me), else NotFound.
  - A left sidebar nav (collapsing to a `<select>` under 768px) listing only the sections the user can access: Dashboard, Users, Groups, Permissions, Reports, Results, Quotes, Races, Audit log.
  - Nested routes: `/admin`, `/admin/users`, `/admin/users/:id`, `/admin/groups`, `/admin/groups/:id`, `/admin/permissions`, `/admin/reports`, `/admin/results`, `/admin/quotes`, `/admin/races`, `/admin/audit`.
  - The header Admin link shows when the user has any permission.
- **Shared admin components**:
  - `DataTable`: a sortable header, a pagination footer "1–25 of 312" with prev/next, an empty state, a loading state, and horizontal scroll on mobile.
  - `SearchInput`: debounced 300ms, synced to the URL.
  - `ConfirmDialog`: optionally type-to-confirm.
  - `PermissionBadge`, `Toolbar`, `Toast`: a small polite live region for "Saved", "Suspended" etc.
  - Errors show the server message in role=alert. Every write button is disabled while pending.
- **Pages**:
  - **Dashboard**: a stat row (users, new this week, results today, open reports, live races) as a typographic row (not cards), plus two small chart.js line charts (signups and results per day, 30 days).
  - **Users**:
    - The list: search, filters (banned, group), sort, and links to the detail.
    - The detail: name/email/joined/status, effective permissions grouped by area, and the groups as a checkbox list (only groups you can grant are enabled, with the reason in the title), plus Save.
    - Actions: rename, sign out everywhere, suspend/unsuspend (with a reason), delete (type the name).
    - Recent results with delete, and reports received/made.
  - **Groups**:
    - The list with member counts, plus "New group".
    - The detail: edit name/description, permissions as checkboxes grouped by area with descriptions (disabled for permissions you don't hold, and for the system group), and members (add by username search, remove).
    - Delete group with confirmation.
  - **Permissions**: the full **matrix**, with groups as columns and permissions as rows grouped by area.
    - Checkbox cells with sticky first-column and header-row, and a hover row highlight.
    - Toggling marks a cell dirty (outlined in --caret).
    - A sticky "Save changes (3)" / "Discard" bar sends PUT `/groups/:id/permissions` per changed group and reports per-group failures.
    - Cells you can't change are disabled with a tooltip explaining why.
    - The system group column is locked, showing all checked.
  - **Reports**: the existing UI moved into the layout and paginated.
  - **Results**: filters (user, mode, language, suspicious) and the table with delete.
  - **Quotes**: the list with filters, plus a create/edit modal with a character counter and source, and delete.
  - **Races**: the live rooms table (auto-refreshes every 5s), with close room.
  - **Audit log**: filters + table; the note is shown in a monospace small font (fine here: it's code-like data).
- All strings in en, pl, de and es (the completeness test must pass).
- Tests:
  - The nav visibility per permission set.
  - The matrix dirty tracking + save calls + disabled cells.
  - The users detail group checkboxes enabled/disabled.
  - The groups permission editor.
  - DataTable pagination.
  - The ConfirmDialog type-to-confirm.
  - The admin NotFound for users without permissions.
