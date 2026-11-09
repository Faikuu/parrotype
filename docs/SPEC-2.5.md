# ParroType 2.5 — addendum

Earlier specs still hold, and the design rules are unchanged. These packages are already installed (don't install others): backend `nodemailer` (+ types), frontend `qrcode` (+ types) and `@fontsource/opendyslexic`.

## Features
1. **Shared engine package** + **verified results**: the server replays the keystroke log to recompute the result. Verified results get a mark, and leaderboards can show verified results only.
2. **Replays of ranked results**: the event logs of verified results are stored, so anyone can watch a leaderboard run.
3. **Password reset** and **email verification** through a pluggable mailer (console in development, SMTP in production).
4. **Two-factor authentication** (TOTP, RFC 6238) with recovery codes.
5. **Notifications**: an in-app bell for new followers, report outcomes (for the reporter), a friend beating your best, and announcements.
6. **Announcements**: site-wide banners managed in the admin panel.
7. **Events**: scheduled typing events with a fixed text, a time window and their own leaderboard, managed in the admin panel.
8. **On-screen keyboard** with finger hints (Learn, and optional in tests).
9. **Funbox modifiers**: mirror, reversed words, memory, random capitals.
10. **Accessibility**: a high-contrast theme, a dyslexia-friendly font, screen-reader announcements, and interface scale.

---

## Phase 1a: schema (one agent owns ALL the schema changes of this wave)
Add to the template and render all 3 providers. One migration per provider (`*_v25`):
```prisma
model User {
  // existing …
  emailVerifiedAt DateTime?
  totpSecret      String?    // base32, AES-256-GCM encrypted at rest (see below); null = 2FA off
  totpEnabledAt   DateTime?
  recoveryCodes   RecoveryCode[]
  authTokens      AuthToken[]
  notifications   Notification[]
}
model AuthToken {               // password reset + email verification
  id        Int      @id @default(autoincrement())
  userId    Int
  purpose   String   // "reset" | "verify"
  tokenHash String   @unique // sha256 hex of the random token; the raw token is only ever emailed
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, purpose])
}
model RecoveryCode {
  id       Int     @id @default(autoincrement())
  userId   Int
  codeHash String  // sha256 hex
  usedAt   DateTime?
  user     User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
model Notification {
  id        Int      @id @default(autoincrement())
  userId    Int
  kind      String   // "follow" | "report_outcome" | "pb_beaten" | "announcement" | "event_start"
  data      String   // JSON, ≤ 1000 chars ({{longText}})
  readAt    DateTime?
  createdAt DateTime @default(now())
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt, createdAt])
}
model Announcement {
  id        Int      @id @default(autoincrement())
  message   String   // ≤ 280 chars
  level     String   @default("info") // "info" | "warning"
  startsAt  DateTime
  endsAt    DateTime?
  createdBy Int?
  createdAt DateTime @default(now())
  @@index([startsAt])
}
model Event {
  id          Int      @id @default(autoincrement())
  slug        String   @unique   // /^[a-z0-9-]{3,40}$/
  title       String             // ≤ 80
  description String   @default("") // ≤ 500 ({{longText}})
  language    String
  text        String             // 20–1000 chars ({{longText}})
  startsAt    DateTime
  endsAt      DateTime
  createdBy   Int?
  createdAt   DateTime @default(now())
  results     Result[]
  @@index([startsAt, endsAt])
}
model Result {
  // existing …
  verified  Boolean @default(false)
  eventId   Int?
  event     Event?  @relation(fields: [eventId], references: [id], onDelete: SetNull)
  replay    ResultReplay?
  @@index([eventId, wpm])
}
model ResultReplay {
  resultId Int    @id
  data     String // JSON: { v: 1, words: string[], events: EngineEvent[], code?: {...} } ({{longText}}; MySQL needs MEDIUMTEXT: add a {{veryLongText}} placeholder → @db.MediumText on mysql, @db.Text on postgresql, plain on sqlite)
  result   Result @relation(fields: [resultId], references: [id], onDelete: Cascade)
}
```
- The `Result.mode` vocabulary adds `event` (mode2 = the event slug).
- `AdminAction` adds the actions `announcement_create`, `announcement_update`, `announcement_delete`, `event_create`, `event_update`, `event_delete`, `user_2fa_reset`.
- Permission catalog additions (code, `src/permissions/catalog.ts`): `announcements.manage` (area announcements), `events.manage` (area events), `users.security` (area users: "Turn off a user's two-factor authentication and resend verification"). The data migration grants all three to Administrators automatically (wildcard); add none of them to Moderators.

## Phase 1b: shared engine (one agent, no schema)
- A new workspace `stack/engine` (package name `@parrotype/engine`): move `stack/frontend/src/lib/engine/**` and `stack/frontend/src/lib/text/**` (with their tests) into `stack/engine/src/{engine,text}`. Plus `src/index.ts` re-exporting the public API.
- It builds to CommonJS in `dist/` (tsc) for the backend; the frontend consumes the TypeScript source through Vite/tsconfig/vitest aliases, keeping the existing import paths `@/lib/engine/*` and `@/lib/text/*` working (map them to `../engine/src/*`), so no frontend import changes are needed.
- The engine tests run with vitest inside `stack/engine` (`npm test` there), and the root `npm test` includes them.
- The backend depends on `"@parrotype/engine": "*"` (workspace), imports from `@parrotype/engine`, and its build/test/jest config resolves it (jest `moduleNameMapper` to the built dist or a ts-jest path; `nest build` must not choke). Root scripts: `build` builds the engine first; `setup` and `postinstall` build the engine.
- Docker: both Dockerfiles copy `stack/engine` and build it.
- The engine must stay pure (no DOM, no Node-only APIs).

---

## Phase 2: backend features (no schema changes; Phase 1 is done)
### Verification + replays (`src/results`)
- `POST /api/results` accepts an optional `replay: { v: 1, words: string[], events: EngineEvent[], code?: { breaks: boolean[]; indent: number[] } }`. The route body limit is 256 KB; elsewhere it stays 50 KB.
  - Validation caps: words ≤ 2000 entries of ≤ 40 chars; events ≤ 20000 entries; each event `t` is a non-decreasing int ≥ 0; `k` ∈ c|s|b|B|n; `ch` a single char.
- When a replay is present, the server runs `replayStateAt(config, words, events, Infinity)` with the config derived from the result fields, then `computeResult`, and compares wpm/raw/accuracy/consistency/charStats/duration to the submitted values (tolerances: wpm/raw ±0.5, accuracy/consistency ±0.5, chars exact, duration ±200ms; time mode uses the configured time for the duration).
  - On a match → `verified = true` and the replay is stored.
  - On a mismatch → 400 "The result doesn't match its keystrokes".
- **Text checks:**
  - daily: words must equal `dailyWords(mode2, language)`.
  - quote: the replay text must equal an existing quote's words in that language (match by the joined text).
  - event: must equal the event's text, and the submission must be within the event window (+60s grace).
  - Other modes: the text is client-chosen and can't be checked, but the timing is.
- A result without a replay stays unverified (allowed, as before).
- Leaderboard: the query param `verified=true` filters to verified results; each entry includes `verified` and `resultId`.
- `GET /api/results/:id/replay` (public, only for verified results of non-banned users): `{ result: {…summary, name}, replay }`. 404 otherwise.
- Events: `POST /api/results` with `mode: 'event'` requires a verified replay. One ranked result per user per event (the best), using the same best-per-user logic.

### Auth: reset, verification, 2FA (`src/auth`, a new `src/mail`)
- `MailService` with a transport chosen by env:
  - `MAIL_TRANSPORT=console` (default in dev/test): logs the message and keeps the last 50 messages in memory for tests.
  - `MAIL_TRANSPORT=smtp`: uses `SMTP_URL` (validated) via nodemailer, with `MAIL_FROM` as the sender.
  - `APP_URL` (e.g. http://localhost:5173) is used for the links. Validate all of them in env.ts.
  - Plain-text emails in the user's language are fine (accept an optional `lang` from the request's Accept-Language among en/pl/de/es).
- **Password reset:**
  - `POST /api/auth/password/forgot { email }` → always 200 `{ ok: true }` (no enumeration; constant-ish time). If the user exists and isn't banned, it creates a token (32 random bytes, base64url; stores the sha256; valid 30 min; invalidates earlier unused reset tokens) and emails `${APP_URL}/reset-password?token=…`. Throttled 5/15min per IP and 3/hour per email.
  - `POST /api/auth/password/reset { token, newPassword }` → validates and marks the token used, sets the password, bumps tokenVersion (all sessions out), and doesn't auto-login. Invalid/expired/used → 400 "This reset link is invalid or has expired".
- **Email verification:**
  - Register sends a verification email (token valid 24h).
  - `POST /api/auth/email/verify { token }` sets emailVerifiedAt.
  - `POST /api/auth/email/resend` (auth, throttled 3/hour).
  - PublicUser gains `emailVerified: boolean` and `twoFactorEnabled: boolean`.
  - Unverified users can still type and save results; **verification is required to appear on leaderboards and to create races?** No: keep it simple and only require it for the leaderboard (unverified users' results are excluded from leaderboards/daily/events boards) and to be followed? No: only the leaderboard rule. Profiles show nothing about it.
- **2FA (TOTP):**
  - Implement RFC 6238 with node crypto (SHA-1, 6 digits, 30s steps, accepting ±1 step), with unit tests against the RFC test vectors.
  - The secret is encrypted with AES-256-GCM using a key derived from `TOTP_ENCRYPTION_KEY` (env, required, ≥ 32 chars; refuse the sample value like JWT_SECRET).
  - `POST /api/auth/2fa/setup` (auth) → `{ secret, otpauthUrl }` (stores a pending secret: store it encrypted with totpEnabledAt null; a new setup replaces a pending one).
  - `POST /api/auth/2fa/enable { code }` → verifies the code, sets totpEnabledAt, and returns 10 recovery codes (format `xxxx-xxxx`, lowercase base32, shown once; stores their sha256).
  - `POST /api/auth/2fa/disable { password, code }` (code = TOTP or a recovery code) → clears everything, bumps tokenVersion.
  - `POST /api/auth/2fa/recovery-codes { password, code }` → regenerates them.
  - **Login with 2FA:** when the password matches and 2FA is enabled, login returns 200 `{ twoFactorRequired: true, ticket }` instead of a session. The ticket is a short-lived (5 min) signed JWT with purpose "2fa" and the user id + tokenVersion. `POST /api/auth/2fa/verify { ticket, code }` → the session cookie + `{ user }`. Throttle the verify to 5/min per ticket+IP; recovery codes work there and are marked used; replaying a TOTP code within its window → rejected (store the last used step per user in memory or the DB: add an in-memory map keyed by userId, which is acceptable).
  - Admin: `POST /api/admin/users/:id/2fa/reset` (users.security, assertCanActOn, audit `user_2fa_reset`).

### Notifications, announcements, events (`src/notifications`, `src/announcements`, `src/events`)
- **Notifications:**
  - `GET /api/notifications?unread=true&page=` (auth, paginated).
  - `GET /api/notifications/unread-count`.
  - `POST /api/notifications/read { ids?: number[] }` (with no ids, all of them).
  - Created on:
    - follow (to the followee; deduped: no repeat within 24h for the same follower)
    - report resolved/dismissed (to the reporter, without revealing the action taken: "Your report about X was reviewed")
    - pb_beaten (when a saved verified result becomes someone's new best in a ranked (mode, mode2, language) and beats the best of a user who follows them, notify those followers: "X beat your best in time 60"; cap at 50 followers per event)
    - announcement (optional fan-out? no: announcements are shown as banners, not per-user rows)
    - event_start: skip it (no scheduler); keep the kind reserved.
  - Keep at most 200 notifications per user (prune the oldest on insert).
- **Announcements:**
  - `GET /api/announcements/active` (public): the active ones (startsAt ≤ now < endsAt or no end), newest first, max 3.
  - Admin CRUD at `/api/admin/announcements` (announcements.manage), audited.
- **Events:**
  - `GET /api/events` (public): upcoming/active/past (past: last 20).
  - `GET /api/events/:slug` (public): the details; the text is hidden until startsAt.
  - `GET /api/events/:slug/leaderboard` (public, verified results only, best per user, excluding banned/unverified-email users).
  - Admin CRUD at `/api/admin/events` (events.manage; validation: endsAt > startsAt, a duration ≤ 30 days, the text length; editing the text/language is refused once the event has started), audited.
- **Permissions:** add the 3 new keys to the catalog. Admin routes use them.

---

## Phase 3: frontend
### Auth UI (`features/auth`, `features/account`)
- `/forgot-password` (email → a neutral message "If an account uses that email, we've sent a link.") and `/reset-password?token=` (new + confirm password, success → "Password changed. Log in with your new password.").
- `/verify-email?token=` (verifies on load, with clear success/expired states).
- An account banner for unverified email ("Verify your email to appear on leaderboards." + "Resend email") and a "Forgot password?" link on login.
- 2FA:
  - Account → Security section: set up (shows a QR from otpauthUrl via `qrcode` toDataURL, plus the secret in groups of 4 for manual entry and a code field), the recovery codes display (copy/download .txt, "I've saved these" to finish), disable (password + code), and regenerate codes.
  - The login flow handles `twoFactorRequired` (a code step with a "Use a recovery code" toggle).
- Admin user detail: "Turn off two-factor" (users.security) and the email verified status.

### Social UI
- Header: a notification bell (Bell icon) with an unread count badge (polls the unread-count every 60s while the tab is visible, plus on focus).
  - The dropdown panel lists the latest 10, with relative times, "Mark all as read", and a link to `/notifications` (a full paginated list).
  - Each kind renders a sentence with links (profile, leaderboard).
- An announcement banner under the header (info: --surface bg; warning: a --caret left border), dismissible per announcement id (localStorage).
- Events: `/events` (upcoming/active/past lists; the active one highlighted) and `/events/:slug` (the description, a countdown to the start, "Start" when active, which runs the event text in a typing view built like the race TypingArea with the replay recorded, submitting `mode: 'event'` with the replay; the event leaderboard below).
- Admin: Announcements and Events sections (CRUD tables + modals, with datetime-local inputs shown in local time and sent as ISO UTC), and the 3 new permissions in the matrix (automatic from the catalog).
- Leaderboard: a "Verified only" toggle, a ✓ mark (a small CheckCircle icon with a "Verified by keystroke replay" tooltip) next to verified entries, and a "Watch" link on entries with replays → `/replay/:resultId` (a full-page replay player reusing ReplayPlayer).

### Typing test UI
- Submit the replay with every saved result (words + events + code extras).
- Results show "Verified" or "Not verified" (with the server's reason if rejected).
- **On-screen keyboard** (`components/OnScreenKeyboard.tsx`): the layout-aware rows (uses the layout emulation setting's legends), the next key highlighted in --main, the finger colour hints (8 fingers, subtle tints from the theme vars mixed with --surface; a setting `keyboardHints: 'off' | 'next' | 'fingers'`). Shown in Learn by default and optionally under the test (setting `showKeyboard`). Hidden in tape/code mode and on small screens (< 640px).
- **Funbox** (setting `funbox: Array<'mirror' | 'reverse' | 'memory' | 'caps'>`):
  - mirror: CSS scaleX(-1) on the words.
  - reverse: each word's letters reversed (transform the words before the test).
  - memory: the words are visible for 3s after the start, then the upcoming words are hidden (rendered in --bg) until typed.
  - caps: random words capitalised (transform).
  - Funbox results are saved but unranked: send `funbox: true` and the backend marks them unranked → add an optional `funbox` boolean to the result input, store it… **no schema change**: reject `funbox` results from ranked modes server-side by accepting them only when mode2 is suffixed? Keep it simple: **funbox results are not submitted** (shown locally only, with the note "Funbox results aren't saved").
- **Accessibility:**
  - a `high-contrast` theme (pure #000/#fff with a yellow main and cyan caret, all text contrast ≥ 7:1)
  - the font option `opendyslexic` (OpenDyslexic for the test text, and an option to use it for the UI too: `uiFont: 'default' | 'dyslexic'`)
  - `uiScale` (0.9 | 1 | 1.1 | 1.25, applied as the root font-size)
  - a polite aria-live region announcing "Test started", "Test finished: 92 words per minute, 97 percent accuracy", and save status changes
  - `prefers-contrast: more` → suggest the high-contrast theme once (a dismissible toast).
- All new strings in en, pl, de and es (the completeness test must pass).
