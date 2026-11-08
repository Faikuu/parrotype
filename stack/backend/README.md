# ParroType API

NestJS 11, Prisma 6, SQLite. Served under `/api`.

## Setup
From the repo root: `npm run setup` (installs, creates `stack/backend/.env`, applies migrations, seeds quotes).

Or by hand, from `stack/backend`:
```sh
cp .env.sample .env        # then set JWT_SECRET to a random string of 32+ characters
npm run prisma:deploy      # apply migrations (dev: npm run prisma:migrate)
npm run seed               # upsert public-domain quotes
npm run start:dev          # http://localhost:3000/api/health
```

## Scripts
- `npm run build`, `npm run start:prod` (runs `dist/main` with `.env` loaded)
- `npm test` (unit tests), `npm run test:e2e` (creates and removes `prisma/test.db`)
- `npm run lint`

## Auth
Session = JWT (HS256, 7 days) in the httpOnly cookie `pt_session`. Set `COOKIE_SECURE=true` behind HTTPS.
