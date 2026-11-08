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
- `npm run test:e2e` runs the end-to-end suite. By default it uses SQLite in `prisma/test.db`, which it deletes and recreates each run. To test another engine, set `E2E_DATABASE_URL` (and optionally `E2E_DATABASE_PROVIDER`; it is inferred from the URL). The run drops the app's tables in that database first, so it has a guard (`test/e2e-guard.ts`) that runs before anything else:
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

## Daily board
Each user is ranked on the daily board by their first result for the UTC date and language. Retries are saved but do not change the rank. The other modes rank each user by their best result.

## Health
`GET /api/health` returns `{ "ok": true, "db": "<provider>" }`.

## Auth
Session = JWT (HS256, 7 days) in the httpOnly cookie `pt_session`. Set `COOKIE_SECURE=true` behind HTTPS.

`JWT_SECRET` must be at least 32 characters with at least 10 distinct characters. The API refuses to start if it is the `.env.sample` placeholder or contains `change-me`. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`, or run `npm run setup` from the repo root, which writes a random one into `.env`.

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
