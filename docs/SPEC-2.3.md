# ParroType 2.3 — addendum

SPEC.md, SPEC-2.1.md and SPEC-2.2.md still hold, and the design rules are unchanged. No new npm packages. If one seems necessary, stop and report instead.

## Features
1. **Code mode**: type short code snippets (JavaScript, Python, Rust, Go) with line breaks and indentation.
2. **Keyboard layout emulation**: practise Dvorak, Colemak, Colemak-DH, Workman, AZERTY or QWERTZ on a physical QWERTY keyboard.
3. **Ghost races**: race a replay of a previous run of the same text ("Race your ghost" on results; daily mode automatically races your first attempt of the day).
4. **Learn**: a guided path of lessons that introduces keys a few at a time, with progress kept locally.
5. **Bigram analysis**: the slowest letter pairs of a test (by the delay between keys), accumulated locally, with "Practice these pairs".
6. **Share card**: a 1200×630 PNG of the result in the current theme (download, or the Web Share API when files can be shared).
7. **Profile badge**: an embeddable SVG badge at `/api/users/:name/badge.svg` showing your best wpm.
8. **Friends**: follow people, a "Following" scope on the leaderboard, and follower counts on profiles.
9. **Moderation**: report a user; an admin area to review reports, suspend/unsuspend accounts and remove results; an audit log. Admins are granted only through a CLI script.
10. **UI in German and Spanish** (added last, after the features).

---

## Backend

### Schema changes (template + all 3 providers)
```prisma
model User {
  // existing fields …
  role       String    @default("user")   // "user" | "admin"
  bannedAt   DateTime?
  banReason  String?
  following  Follow[]  @relation("follower")
  followers  Follow[]  @relation("followee")
  reportsMade     Report[] @relation("reporter")
  reportsReceived Report[] @relation("target")
}
model Follow {
  followerId Int
  followeeId Int
  createdAt  DateTime @default(now())
  follower   User @relation("follower", fields: [followerId], references: [id], onDelete: Cascade)
  followee   User @relation("followee", fields: [followeeId], references: [id], onDelete: Cascade)
  @@id([followerId, followeeId])
  @@index([followeeId])
}
model Report {
  id         Int      @id @default(autoincrement())
  reporterId Int
  targetId   Int
  reason     String   // "name" | "cheating" | "other"
  details    String?  // ≤ 500 chars ({{longText}})
  status     String   @default("open") // "open" | "resolved" | "dismissed"
  createdAt  DateTime @default(now())
  resolvedAt DateTime?
  reporter   User @relation("reporter", fields: [reporterId], references: [id], onDelete: Cascade)
  target     User @relation("target", fields: [targetId], references: [id], onDelete: Cascade)
  @@index([status, createdAt])
}
model AdminAction {
  id        Int      @id @default(autoincrement())
  adminId   Int?     // nullable: CLI actions and deleted admins
  action    String   // "ban" | "unban" | "delete_result" | "resolve_report" | "dismiss_report" | "grant_admin" | "revoke_admin"
  target    String   // e.g. "user:42", "result:9", "report:3"
  note      String?
  createdAt DateTime @default(now())
  @@index([createdAt])
}
```
Each provider needs a new migration (sqlite via `migrate dev`; postgresql/mysql via `prisma migrate diff --from-schema-datamodel <previous rendered schema> --to-schema-datamodel <new> --script`). Keep the previous rendered schema from git for the diff. All 3 must pass e2e.

### Endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| PUT | `/api/users/:name/follow` | required | Idempotent. You can't follow yourself (400). Max 1000 follows per user (400 beyond that). |
| DELETE | `/api/users/:name/follow` | required | Idempotent. |
| GET | `/api/users/:name` | optional (OptionalJwtAuthGuard) | Adds `followers: number`, `following: number`, `isFollowing: boolean` (false when anonymous). |
| GET | `/api/leaderboard` | optional | New `scope=all\|following` (default all). `following` requires auth (401 otherwise) and covers the people you follow plus yourself. |
| GET | `/api/users/:name/badge.svg` | – | `?mode=time&mode2=60&language=en` (defaults time/60/en; the same per-mode validation as the leaderboard). The SVG shows "parrotype" plus e.g. "92 wpm · time 60" (the middle dot is fine inside an image). Unknown, banned or no data → a 404 with a neutral "no result" SVG. Headers: `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=600`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Content-Type-Options: nosniff`. All interpolated text is XML-escaped. A flat 2-part design with colours from the Kea theme. |
| POST | `/api/users/:name/report` | required | `{ reason, details? }`. Throttled 5/min. One open report per (reporter, target): a second gives 409 "You have already reported this user". You can't report yourself. |
| GET | `/api/admin/reports` | admin | `?status=open\|resolved\|dismissed` (default open), the newest 100, with the reporter and target names, the target's bannedAt, and the target's last 5 results. |
| POST | `/api/admin/reports/:id/resolve` · `/dismiss` | admin | Sets the status + resolvedAt and logs it. |
| POST | `/api/admin/users/:name/ban` | admin | `{ reason }` (1–200 chars). Sets bannedAt/banReason, bumps tokenVersion (kills sessions) and logs it. Banning another admin → 400. |
| POST | `/api/admin/users/:name/unban` | admin | Logs it. |
| DELETE | `/api/admin/results/:id` | admin | Logs it. |
| GET | `/api/admin/actions` | admin | The newest 100 audit entries with the admin name. |
| GET | `/api/auth/me` | | `PublicUser` gains `role`. |

- **AdminGuard**: JwtAuthGuard plus a DB lookup that `role === 'admin'` and the user isn't banned. Never trust a role in the JWT.
- **Banned users**:
  - Login → 403 "This account has been suspended".
  - The session guard rejects banned users (treated like no session).
  - They're excluded from the leaderboard, daily boards and race identity.
  - Their profile and badge return 404.
  - They can't submit results.
- **CLI**: `npm run admin -- grant <name>` / `revoke <name>` / `list` (scripts/admin.ts via ts-node using the Prisma client and the provider env), logged as AdminAction with adminId null. There's no HTTP path to become an admin.
- **Results**:
  - New mode `code` (mode2 ∈ `js|py|rs|go`, language = the UI-agnostic `en`; saved, not ranked).
  - New mode `lesson` is NOT accepted (lessons are local only).
  - Add `code` to the unranked set and to the per-mode validation.

---

## Frontend lib

### Code mode (`lib/text/code.ts`, `lib/engine`)
- `CODE_SNIPPETS: Record<'js' | 'py' | 'rs' | 'go', Array<{ id: string; title: string; code: string }>>`: about 10 original, idiomatic, short snippets per language (4–12 lines, ≤ 70 chars per line, ASCII only, spaces for indentation (no tabs), no trailing spaces). Write them yourself, original and clean. Topics like fizzbuzz, binary search, debounce, word count, a struct with a method, and so on.
- `codeToWords(code): { words: string[]; breaks: boolean[]; indent: number[] }`. It splits each line on runs of spaces into words. `breaks[i]` is true when word i is the last on its line (except the final word). `indent[i]` = the leading spaces of the line when word i is the first word on it, else 0. Blank lines are dropped.
- Engine: `EngineState.code?: { breaks: boolean[]; indent: number[] }` (set by `createInitialState(config, words, extras?: { code? })`).
  - In mode `code`, at a word with `breaks[i]`, the separator is **Enter** (the `newline` action) instead of space: space there is a no-op, and newline acts like space does elsewhere (it moves to the next word and counts as a correct separator keystroke).
  - Elsewhere newline is a no-op.
  - It finishes like words mode.
  - Stats: count line breaks like spaces.
  - Extend `TestConfig.mode` with `'code'` and add `codeLanguage: 'js' | 'py' | 'rs' | 'go'`; mode2 = codeLanguage.
- `wordsForConfig` for code: a random snippet for codeLanguage → returns its words. Add a `codeForConfig(config, rng?)` that returns the full `{ words, breaks, indent, snippet }`.

### Keyboard layouts (`lib/text/layouts.ts`)
- `LAYOUTS: Record<LayoutId, { name: string; map: Record<string /*KeyboardEvent.code*/, [string, string] /*[normal, shifted]*/> }>` for `qwerty` (identity), `dvorak`, `colemak`, `colemak_dh` (ANSI), `workman`, `azerty` (French), `qwertz` (German). Cover the letter keys, the digit row, and the punctuation keys (Minus, Equal, BracketLeft/Right, Backslash, Semicolon, Quote, Comma, Period, Slash, Backquote).
- `translateKey(layout, code, shift): string | null`. Tests: spot-check known positions (e.g. Dvorak KeyS → 'o', Colemak KeyE → 'f', AZERTY KeyQ → 'a', QWERTZ KeyY → 'z').

### Bigrams (`lib/engine/bigrams.ts`)
- `computeBigrams(state): Record<string, { total: number; count: number }>`: for consecutive **correct** keystrokes within the same word (use the events/keystrokes with expected chars), key = the previous expected char + the current one (lowercase letters only), value = the sum of the delays in ms. Skip delays over 2000ms (pauses).
- `mergeBigrams(a, b, decay = 0.9)` and `slowestBigrams(stats, n = 5, minCount = 3): Array<{ pair: string; avgMs: number; count: number }>`.
- `bigramWords(pairs, language, count = 40, rng?)`: words from the language list weighted by how many target pairs they contain (like weakKeyWords). It falls back to normal words.

### Lessons (`lib/text/lessons.ts`)
- `LESSONS: Array<{ id: string; title: string; keys: string /*new letters*/; allowed: string /*cumulative*/; goalWpm: number; goalAcc: number }>`: about 14 lessons for English QWERTY touch typing. Home row first (f j, d k, s l, a ;), then e i, r u, t y g h, the bottom row, the top row, capitals, punctuation basics, and real words.
- `lessonWords(lesson, count = 30, rng?)`: real words from `en` that only use the allowed letters; if there are fewer than 15 distinct words, pad with pronounceable pseudo-words built from the allowed letters (alternating consonant/vowel clusters, length 2–6). Never use letters outside `allowed`. Tests verify this for every lesson.

### Ghost
- `ghostPosition(config, words, events, elapsedMs, code?)` uses replayStateAt to return `{ word, char }`, the ghost's caret at the elapsed time (or the end once it's finished).

---

## Frontend UI

### Typing test (features/test)
- **Code mode**:
  - ConfigBar mode "code" with sub-options js/py/rs/go.
  - Words renders a line break after `breaks[i]` words and indentation (`indent` spaces as non-typeable padding) before line-start words, plus a faint `↵` glyph in --sub at each line end that turns --text once passed.
  - Tape mode is disabled in code mode.
  - The snippet title is shown under the code like a quote source.
  - Enter at line ends; the quick-restart Tab handling must still work (Tab doesn't type in code mode).
- **Layout emulation**: the setting `layout: LayoutId` (default qwerty), in the command line + settings. When it isn't qwerty, keydown events with a mapped `e.code` (and no ctrl/meta/alt) are preventDefault-ed and dispatched as the translated char (skip beforeinput for those). Also applied in the race TypingArea and the Learn typing area (share a small helper hook). The heatmap shows the target layout's legends.
- **Ghost**:
  - Results gets a "Race your ghost" button (Ghost icon): it restarts with the same words (repeat) and shows a ghost caret replaying this run (a 2px caret in --sub at 50%, with a small "ghost" label in its tooltip).
  - Daily: store your first attempt's events + words locally per date+language (localStorage `parrotype:daily-ghost`, keeping only the last 3 dates). Later attempts that day show that ghost automatically.
  - A setting `ghost: boolean` (default true) to hide it.
  - The ghost and the pace caret can both show; give them distinct styles.
- **Bigrams**:
  - A local accumulated store (`store/bigramStats.ts`, per language, persisted).
  - On results, "Slowest pairs": up to 5 pairs with their avg ms, plus "Practice these pairs", which runs custom text from bigramWords.
- **Share card** (`features/test/shareCard.ts`): draw on a canvas with the theme CSS vars:
  - The parrot mark + "parrotype", the big wpm in --main, acc, the test label, a mini wpm line chart (drawn manually, no chart.js), the date, and the username if signed in.
  - The UI font, after `document.fonts.ready`.
  - A "Share" round button: if `navigator.canShare?.({ files })`, share; else download `parrotype-result.png`.

### Pages
- **Learn** (`/learn`, `features/learn`):
  - The lesson path as a vertical list (number + title + the new keys as Kbd + a status: locked/available/passed with its best wpm/acc). The numbering is legitimate here, since it's a sequence.
  - A lesson view: the instructions ("New keys: f and j. Keep your index fingers on the bumps.") plus a typing area (reuse the race TypingArea or extract a shared one) with the lesson words, and a result (passed if goalWpm and goalAcc are met).
  - Progress is in localStorage `parrotype:lessons` with try/catch.
  - Passing unlocks the next lesson; you can always replay passed ones and preview a locked one (it's disabled with the reason "Pass lesson 3 first").
  - Lessons ignore the layout emulation setting? No: they follow it, and lesson keys refer to positions, so show a note when emulating.
  - A header nav link (GraduationCap icon).
- **Friends**:
  - The profile gets a Follow/Unfollow button (optimistic update), the follower/following counts, and a "Report" text button (a modal with the reason radio + details textarea, then "Thanks. A moderator will look at it." or the 409 message).
  - The leaderboard gets a scope pill "Everyone / Following" (Following shown only when signed in).
- **Badge**: on the account page, "Embed your badge" shows the badge image preview plus copyable Markdown and HTML snippets (mode selector time 15/30/60/120, words 10/25/50/100).
- **Admin** (`/admin`, lazy, only linked in the header when `user.role === 'admin'`; the page itself 404s for non-admins):
  - Tabs Reports / Audit log.
  - The reports table: date, reporter, target (a link to the profile), reason, details, the target's recent results with a delete button per result, and actions resolve/dismiss/ban (ban asks for a reason in a modal).
  - Banned users show "suspended" and an unban button.
  - Audit log table.
- **i18n**: every new string in en + pl. The final agent adds full `de` and `es` UI translations for ALL namespaces (and the settings `uiLanguage` accepts de/es; the command line lists 4 interface languages).
