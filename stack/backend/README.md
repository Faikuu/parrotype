# ParroType API

NestJS 11, Prisma 6, zod validation. Runs on SQLite (default), PostgreSQL or MySQL/MariaDB. Served under `/api`.

## Setup
From the repo root: `npm run setup` (installs, creates `stack/backend/.env`, generates the Prisma client, applies migrations, seeds quotes).

Or by hand, from `stack/backend`:
```sh
cp .env.sample .env        # then set JWT_SECRET: the sample value is refused at startup (see below)
npm run prisma:deploy      # apply migrations (dev: npm run prisma:migrate)
npm run seed               # upsert public-domain quotes
npm run start:dev          # http://localhost:3000/api/health
```

## Choosing a database

`DATABASE_PROVIDER` picks the engine. `DATABASE_URL` must match it, and the API refuses to start otherwise.

| `DATABASE_PROVIDER` | `DATABASE_URL` example | Notes |
|---|---|---|
| `sqlite` (default) | `file:../dev.db` | A file. The path is relative to `prisma/sqlite/`, so this is `prisma/dev.db`. |
| `postgresql` | `postgresql://parrotype:secret@localhost:5432/parrotype` | `postgres://` also works. |
| `mysql` | `mysql://parrotype:secret@localhost:3306/parrotype` | Tested with MariaDB 10.11. MySQL 8 uses the same migrations but is not tested here. |

Switching engines:
1. Set `DATABASE_PROVIDER` and `DATABASE_URL` together in `.env`.
2. `npm run prisma:generate` (the Prisma client is shared, so it has to be generated for the engine in use; `npm install` and `npm run build` do it too).
3. `npm run prisma:deploy` to apply that engine's migrations to the database. The database must exist and the user needs to create tables in it.
4. `npm run seed`.

Upgrading an existing checkout: the SQLite file used to be `file:./dev.db`. Because the schema moved into `prisma/sqlite/`, change the line to `DATABASE_URL="file:../dev.db"`. The file itself stays at `prisma/dev.db`.

PostgreSQL and MariaDB are not started by this project. Run them yourself, or use the Docker stack below.

## How the schema is organised
- `prisma/schema.template.prisma` is the single source of the data model. Provider-specific bits are placeholders: long text columns become `@db.Text` on PostgreSQL and MySQL, and emails get `VARCHAR(254)` on those two.
- `prisma/<provider>/schema.prisma` is rendered from the template by `scripts/prisma-schema.mjs`. Both are committed. Do not edit the rendered files. Run `npm run prisma:schema` after changing the template.
- `prisma/<provider>/migrations/` holds the migrations for each engine. SQLite has its own history (`prisma/sqlite/migrations`). PostgreSQL and MySQL start from one init migration generated with `prisma migrate diff --from-empty`.
- A schema change means updating the template and adding a migration in each provider's folder. `npm run prisma:migrate` does that for the engine in `DATABASE_PROVIDER`, using that engine's database.
- `scripts/prisma.mjs` is the entry point for every Prisma command. It loads `.env` (without overriding variables already set), picks the provider's schema and runs the Prisma CLI, so for example `node scripts/prisma.mjs migrate status` checks the provider you have configured.

## Scripts
- `npm run build` (generates the client, then `nest build`), `npm run start:prod` (runs `dist/main` with `.env` loaded)
- `npm test` (unit tests)
- `npm run test:e2e` runs the end-to-end suite (SQLite, PostgreSQL and MariaDB all pass it). By default it uses SQLite in `prisma/test.db`, which it deletes and recreates each run. To test another engine, set `E2E_DATABASE_URL` (and optionally `E2E_DATABASE_PROVIDER`; it is inferred from the URL). The run drops the app's tables in that database first, so it has a guard (`test/e2e-guard.ts`) that runs before anything else:
  - The default `prisma/test.db` is always allowed.
  - Any other SQLite file needs `E2E_ALLOW_RESET=1` and a file name ending in `test.db` or `e2e.db`.
  - PostgreSQL or MySQL needs `E2E_ALLOW_RESET=1`, a database name `parrotype_e2e`, `parrotype_e2e_<suffix>` or `<name>_test`, and a host of `localhost`, `127.0.0.1` or `::1`.

  Anything else fails with a message saying why, and nothing is dropped. The guard is unit-tested in `src/e2e-guard.spec.ts`, so `npm test` covers it.

  ```sh
  E2E_ALLOW_RESET=1 E2E_DATABASE_URL='postgresql://parrotype:parrotype@localhost:5432/parrotype_e2e' npm run test:e2e
  E2E_ALLOW_RESET=1 E2E_DATABASE_URL='mysql://parrotype:parrotype@localhost:3306/parrotype_e2e' npm run test:e2e
  ```

  The run also regenerates the Prisma client for the engine it runs against, so run `npm run prisma:generate` afterwards to get your own provider back.
- `npm run lint`
- `npm run prisma:schema` renders the per-provider schemas from the template.
- `npm run admin -- grant|revoke <name>` and `npm run admin -- list` manage admins (see Admin CLI below).

## Daily board
Each user is ranked on the daily board by their first result for the UTC date and language. Retries are saved but do not change the rank. The other modes rank each user by their best result.

## Code mode
`mode: "code"` saves a result for a code snippet. `mode2` is the language (`js`, `py`, `rs` or `go`) and `language` must be `en`. Code results are saved and listed on the owner's history, but they are never ranked: `GET /api/leaderboard?mode=code` is a 400, and the public profile's bests leave them out. The `lesson` mode is not accepted (lessons are local only).

## Friends
Follows are one-way. The follower's `pt_session` cookie is needed for every change.

| Method | Path | Notes |
|---|---|---|
| `PUT` | `/api/users/:name/follow` | Idempotent. Returns `{ "following": true }`. Yourself is a 400. A user can follow at most 1000 people (400 beyond that). Suspended accounts are a 404. |
| `DELETE` | `/api/users/:name/follow` | Idempotent. Returns `{ "following": false }`. Works for a suspended account too, so a follow can be dropped. |

- `GET /api/users/:name` adds `followers`, `following` and `isFollowing`. The counts leave out suspended accounts. `isFollowing` is `false` for anonymous viewers.
- `GET /api/leaderboard?scope=following` (with `mode`, `mode2`, `language`) covers you and the people you follow. Anonymous requests get a 401. `scope=all` is the default.

## Profile badge
`GET /api/users/:name/badge.svg?mode=time&mode2=60&language=en` is an embeddable SVG of the user's best wpm for one ranked filter (the same validation as the leaderboard; defaults `time`, `60`, `en`). It reads "parrotype" and, for example, "92 wpm · time 60". An unknown or suspended user, or no matching result, gets a 404 with a neutral "no result" badge.

Headers: `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=600`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Content-Type-Options: nosniff`. The badge sends `Cross-Origin-Resource-Policy: cross-origin` in place of helmet's `same-origin` default, because a same-origin policy stops other sites from loading the image. All text is XML-escaped (`renderBadge` in `src/users/badge.ts`).

## Moderation
- Any signed-in user can report another user: `POST /api/users/:name/report` with `{ "reason": "name" | "cheating" | "other", "details"?: string (at most 500 characters) }`. It is throttled to 5 a minute. You can't report yourself (400). While you have an open report against someone, another one is a 409 "You have already reported this user". The check runs in the service, not in the database, since no partial unique index works on all three engines, so a race can rarely add a second open report.
- Admins use `/api/admin/*`, guarded by `AdminGuard`. It checks the session, then reads `role` from the database on every request, so the role in a token is never trusted and a revoked admin loses access at once. No session is 401; a signed-in non-admin is 403.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/admin/reports?status=open\|resolved\|dismissed` | Default `open`, newest 100. Each report has the reporter, the target (with `bannedAt`), and the target's 5 most recent results. |
| `POST` | `/api/admin/reports/:id/resolve` · `/dismiss` | Only an open report can be decided (409 otherwise). |
| `POST` | `/api/admin/users/:name/ban` | Body `{ "reason" }` (1 to 200 characters). Bumps `tokenVersion`, so the user's sessions end at once. Admins can't be banned (400); a repeat is a 409. |
| `POST` | `/api/admin/users/:name/unban` | 409 if the user is not suspended. |
| `DELETE` | `/api/admin/results/:id` | Deletes one result. |
| `GET` | `/api/admin/actions` | The newest 100 audit entries, with the admin's name where the admin still exists. |

Every admin action writes an `AdminAction` row in the same transaction as the change.

What a suspended account gets:
- Login: 403 "This account has been suspended". This is checked after the password, so a stranger still sees the generic 401.
- Its sessions (including the race socket's identity) are treated as signed out, so the API answers 401.
- Profile and badge: 404. It is left out of the leaderboards, the daily board and the following board. It can't be followed or reported (404).

## Admin CLI
There is no HTTP path to become an admin. Admins are granted and revoked from the shell, on the database that `DATABASE_PROVIDER` and `DATABASE_URL` point to:

```sh
npm run admin -- grant <name>     # also accepts any letter case for the name
npm run admin -- revoke <name>
npm run admin -- list             # id, name, created time, "suspended" when banned
```

`scripts/admin.mjs` loads `.env` the same way `scripts/prisma.mjs` does and runs `scripts/admin.ts` through ts-node. It does not generate the Prisma client. If the generated client was made for another engine, it stops and tells you to run `npm run prisma:generate`. Each grant or revoke writes an `AdminAction` with a null `adminId` and the note `cli`. A grant does not check for suspension, so a suspended user can be made admin, but they can't use it until unbanned.

## Health
`GET /api/health` returns `{ "ok": true, "db": "<provider>" }`.

## Auth
Session = JWT (HS256, 7 days) in the httpOnly cookie `pt_session`. Set `COOKIE_SECURE=true` behind HTTPS.

`JWT_SECRET` must be at least 32 characters with at least 10 distinct characters. The API refuses to start if it is the `.env.sample` placeholder or contains `change-me`. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`, or run `npm run setup` from the repo root, which writes a random one into `.env`.

## Races (WebSocket)

- `POST /api/races` with `{ "language": "en" }` creates a room and returns `{ "id" }` (throttled to 10 per minute per IP). A client IP may hold at most 20 open rooms; beyond that the answer is 429 "You have too many open races".
- The socket is at `/api/races/ws` (not under the global prefix). Messages are JSON text frames with a `type` field; the protocol is in `docs/SPEC-2.2.md`.
- The socket is accepted only when its `Origin` is in `CORS_ORIGINS`. Otherwise it is closed with 1008. Behind a reverse proxy, the proxy must pass the browser's `Origin` header through and forward the Upgrade headers (see `stack/frontend/nginx.conf`).
- Client IP for the limits: the first `X-Forwarded-For` entry when `TRUST_PROXY` is above 0, otherwise the socket's address. Set `TRUST_PROXY` only when a proxy you control appends to that header.
- Socket limits: 10 open sockets per client IP and 2000 in total (the extras are closed with 1013 "Too many connections"). A socket that has not sent a valid `join` within 10 s is closed with 1008 "Join timeout". The server pings every 25 s, and a socket that has not answered the previous ping is terminated.
- Rooms live in memory: at most 8 players, 500 rooms, a room with no joined player expires after 2 minutes, and a 30-minute idle timeout. A restart drops them. Run one API instance, or races on a second instance will not see each other's rooms.
- A player who disconnects during a countdown or a race keeps their seat for 60 seconds, and can take it back with the token from `joined`. After that the seat is removed.
- Finish times and wpm are computed by the server from its own clock. The client's claimed wpm and duration are ignored, and a finish that would be above 350 wpm is refused.
- `RACE_COUNTDOWN_MS` (default 3000, max 10000) sets the countdown. The e2e test lowers it.
- `RACE_MAX_SOCKETS_PER_IP` (default 10), `RACE_JOIN_TIMEOUT_MS` (default 10000) and `RACE_HEARTBEAT_MS` (default 25000) set the socket limits. The e2e test and manual checks lower them.

## Docker
`docker-compose.yml` in the repo root runs PostgreSQL 16, the API (`stack/backend/Dockerfile`) and the web app (`stack/frontend/Dockerfile`, nginx, which proxies `/api` to the API).

```sh
# in the repo root, create .env (Compose reads it; keep it out of git):
#   JWT_SECRET=<at least 32 random characters>
#   POSTGRES_PASSWORD=<letters and digits only; it goes into the database URL>
docker compose up -d --build
```

Open http://localhost:8080. Only the web container is published. The API image runs `prisma migrate deploy` on start, then the server, as the `node` user. The database schema is created on first start.

Set `COOKIE_SECURE=true` (in `docker-compose.yml`) once the site is served over HTTPS, and put a TLS proxy in front of port 8080.

## Security notes
Sessions are HS256 JWTs in an httpOnly cookie. Logging out bumps a token version, which revokes tokens issued before. Passwords are bcrypt (cost 12). Behind a reverse proxy, set `TRUST_PROXY` to the number of hops so rate limits apply per client.
