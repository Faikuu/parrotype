# ParroType 2.1 — addendum to SPEC.md

Everything in SPEC.md still holds unless this file changes it. Same design rules.

## Summary of new features
1. **More database engines**: SQLite (default), PostgreSQL, MySQL/MariaDB, chosen with `DATABASE_PROVIDER`.
2. **Daily challenge**: a new `daily` mode. Everyone gets the same text for a UTC date, and it has its own leaderboard.
3. **Weak keys practice**: a new `weak` mode that builds words around the letters you miss most (stats kept locally).
4. **Per-key stats** on the results screen (a keyboard heatmap of misses).
5. **Pace caret**: a second, faint caret moving at your personal best, your average, or a set wpm.
6. **Tape mode**: a single line that scrolls horizontally.
7. **Typing sounds**: synthesised with Web Audio (no audio files).
8. **Copy result**: copies a plain-text summary of the result to the clipboard.
9. **Local personal bests**: a "New personal best" message works even when signed out.
10. **German and Spanish**: word lists, pangrams and quotes.
11. **Public profiles** at `/u/:name`; **account settings**: change password, delete account.
12. **Docker**: Dockerfile + compose for the full stack with Postgres.

## Shared types (changed)
```ts
type Language = 'en' | 'pl' | 'de' | 'es';
type Mode = 'time' | 'words' | 'quote' | 'zen' | 'pangram' | 'custom' | 'daily' | 'weak';
```
- `daily`: mode2 = the UTC date `YYYY-MM-DD`. The text is 1 pangram followed by 40 words with punctuation, all generated from a seed derived from the date + language (see the lib section). It finishes like words mode and is ranked.
- `weak`: mode2 = `"weak"`. 40 words. It finishes like words mode, is saved, and is **not ranked**.
- Ranked modes: time, words, quote, pangram, daily. Not ranked: zen, custom, weak.

---

## Backend

### Database engines
- One source schema, `prisma/schema.template.prisma`, holds placeholders for the provider and the long-text column type.
- `scripts/prisma-schema.mjs` (in stack/backend) renders it into `prisma/<provider>/schema.prisma`. Long text becomes `@db.Text` for mysql and postgresql and is left plain for sqlite. Each provider keeps its own migrations in `prisma/<provider>/migrations`.
- `DATABASE_PROVIDER` = `sqlite` | `postgresql` | `mysql` (default sqlite). Validated in env.ts and checked against the DATABASE_URL scheme (`file:`, `postgres(ql)://`, `mysql://`); a mismatch fails startup with a clear message.
- `scripts/prisma.mjs <prisma args…>` loads `.env`, renders the schema for the provider and runs `prisma <args> --schema prisma/<provider>/schema.prisma`. Every npm script that uses prisma goes through it (`prisma:generate`, `prisma:migrate`, `prisma:deploy`, `seed`, postinstall generate).
- The migrations for each provider are created with `prisma migrate diff --from-empty --to-schema-datamodel … --script` (no live DB needed) and are committed, so `prisma:deploy` works on a fresh database.
- Postgres and MariaDB are both available in the dev container (`apt` installed). Run the e2e suite against all three engines.
- `/api/health` returns `{ ok: true, db: '<provider>' }`.

### New and changed endpoints
| Method | Path | Auth | Body / query | Response |
|---|---|---|---|---|
| POST | `/api/results` | required | as before, plus mode `daily`/`weak` and language de/es | `201 Result` |
| GET | `/api/leaderboard` | – | `mode` may be `daily` (mode2 = `YYYY-MM-DD`) | as before; 400 for zen/custom/weak |
| GET | `/api/daily` | – | `?language=en` | `{ date: 'YYYY-MM-DD', language, entries: LeaderboardEntry[] }` (today's UTC daily board, top 50) |
| GET | `/api/users/:name` | – | name lookup is case-insensitive | `PublicProfile` or 404 `"No user with that name"` |
| PATCH | `/api/auth/password` | required | `{ currentPassword, newPassword }` | `{ ok: true }`; bumps tokenVersion and sets a fresh cookie (other sessions get logged out). Wrong current password → 401 `"Current password is incorrect"`. Throttled 10/min. |
| DELETE | `/api/auth/account` | required | `{ password }` | `{ ok: true }`; deletes the user + results (cascade), clears the cookie. Wrong password → 401. Throttled 10/min. |

```ts
type PublicProfile = {
  name: string; createdAt: string;
  totalTests: number; totalTimeMs: number;
  bests: Array<{ mode: string; mode2: string; language: string; wpm: number; accuracy: number; createdAt: string }>; // ranked modes only, best per (mode,mode2,language)
  recent: Array<{ mode: string; mode2: string; language: string; wpm: number; accuracy: number; createdAt: string }>; // last 10
};
```
Never expose email in public endpoints.

Daily validation on submit: `mode2` must match `/^\d{4}-\d{2}-\d{2}$/` and equal today's UTC date or yesterday's (a grace period for tests that cross midnight). Otherwise 400 `"Daily results are only accepted for today's challenge"`.
Weak: mode2 must be `"weak"`.

### Quotes
Add public-domain quotes: German (about 15: Goethe, Schiller, Heine, Kant, Grimm, Nietzsche (pre-1900 works), proverbs) and Spanish (about 15: Cervantes, Bécquer, Quevedo, Machado (pre-1929 works), proverbs). Each language needs short, medium and long (>250 chars) entries. Plus the Polish long quotes that the orchestrator supplies in the task prompt.

### Docker
- `stack/backend/Dockerfile` (multi-stage, node:22-alpine, runs `prisma:deploy` and then the server as a non-root user).
- `stack/frontend/Dockerfile` (builds, then serves `dist` with nginx; nginx proxies `/api` to the backend service and falls back to index.html for SPA routes).
- Root `docker-compose.yml`: `db` (postgres:16-alpine with a volume and a healthcheck), `api` (DATABASE_PROVIDER=postgresql; JWT_SECRET from `.env`, required, with no default), `web` (port 8080). Only `web` is published to the host. Don't put any secret values in the compose file; read them from env with `${JWT_SECRET:?set JWT_SECRET}`.

---

## Frontend lib (pure TS, in src/lib)

### Languages
- `wordlists/de.ts` (export `de`) and `wordlists/es.ts` (export `es`): about 400 common lowercase words each, with no duplicates.
- `ALPHABETS.de = 'abcdefghijklmnopqrstuvwxyzäöüß'` and `ALPHABETS.es = 'abcdefghijklmnñopqrstuvwxyz'`. In Spanish, accented vowels (á é í ó ú ü) count as their base letter for pangram coverage (normalise with NFD and strip the combining marks, but keep ñ). The word lists must cover every letter of their alphabet at least 3 times (de: include words with ä ö ü ß, q, x, y; es: ñ, k, w, x).
- `LANGUAGES: readonly Language[]`, plus `LANGUAGE_NAMES: Record<Language, string>` (English, Polski, Deutsch, Español).

### Daily
`lib/text/daily.ts`:
- `utcDateString(now = Date.now()): string` returns 'YYYY-MM-DD'.
- `dailySeed(date: string, language: Language): number` is a stable 32-bit FNV-1a hash of `parrotype-daily:${date}:${language}`.
- `dailyWords(date, language): string[]` = `generatePangrams(language, 1, { rng, punctuation: true })` followed by `generateWords({…punctuation: true, numbers: false, language}, 40, rng)`, with `rng = createRng(dailySeed(date, language))`. It's deterministic. Note in a comment that changing the word lists changes the daily text.

### Key stats and weak keys
- `Keystroke` gains `expected: string` (the target char at that position; `''` for extra chars and zen). The engine fills it in.
- `lib/engine/keystats.ts`:
  - `type KeyStat = { hits: number; misses: number }`, `type KeyStatsMap = Record<string, KeyStat>`.
  - `computeKeyStats(state): KeyStatsMap` is keyed by the lowercased expected char, letters only (skip spaces and extras). A hit is a correct keystroke and a miss is an incorrect one.
  - `mergeKeyStats(a, b, decay = 0.9): KeyStatsMap` applies an exponential decay to the old values so recent tests count more.
  - `weakestKeys(stats, alphabet, n = 5, minSamples = 8): string[]` ranks by miss rate, with ties broken by misses.
- `TestResult` gains `keyStats: KeyStatsMap`.
- `lib/text/weak.ts`: `weakKeyWords(weak: string[], language, count = 40, rng?)` picks words from the language list weighted by (1 + 3 × the number of weak letters they contain)², with no immediate repeats. When `weak` is empty it falls back to normal words.

### Pace caret
`lib/engine/pace.ts`: `pacePosition(words: string[], wpm: number, elapsedMs: number): { word: number; char: number } | null` walks the target text (with the spaces between words) for `wpm × 5 × elapsedMs / 60000` chars, and returns null when it's past the end or wpm <= 0.

### Generator
`wordsForConfig` handles `daily` (dailyWords for today) and `weak` (it needs the weak letters, so add an optional third parameter `extras?: { weakKeys?: string[]; now?: number }`).

---

## Frontend UI

### Settings (store/settings.ts; persisted; validated in sanitize)
New keys: `paceCaret: 'off' | 'pb' | 'average' | 'custom'` (default off), `paceWpm: number` (default 60, clamped 10–300), `tapeMode: boolean` (default false), `sound: 'off' | 'click' | 'soft' | 'typewriter'` (default off), `soundVolume: number` (0–1, default 0.5), `language` accepts de/es, and `mode` accepts daily/weak.

New persisted stores:
- `store/keyStats.ts` holds the local key stats (`parrotype:keystats`), merged after every finished test.
- `store/localBests.ts` holds `Record<string /* mode|mode2|language|punct|numbers */, { wpm; accuracy; at }>` (`parrotype:bests`) plus a running average of the last 10 wpm values.

### Typing test
- ConfigBar: add `daily` and `weak` to the modes. Daily shows the date (e.g. "Nov 8") as a non-interactive label. Weak shows the weakest letters (e.g. "q z x j k"), or "Type a few tests first" when there isn't enough data. The language toggle becomes a small dropdown or cycle over the 4 languages.
- Pace caret: a second caret, 2px, `--sub` at 60%, no breathing, linear glide, positioned with pacePosition every tick. The pace source is the local PB for the current config key (when signed in, prefer the server PB from the summary bests if it's higher), the local average, or `paceWpm`. Hidden in zen/custom and when there's no PB yet.
- Tape mode: the words render on one line inside a fixed-height viewport. The line translates left so the caret stays about 40% from the left edge, and the edges fade with a CSS mask. The caret measurement still works.
- Sounds: `features/test/sound.ts` uses lazy AudioContext creation (on the first keystroke, which satisfies autoplay rules). Three synthesised profiles: click (a short noise burst through a bandpass filter), soft (a sine blip with a quick decay), typewriter (a noise burst plus a low thump). Errors play a slightly detuned variant. It respects soundVolume. No audio files.
- Results: add a keyboard heatmap (a QWERTY layout; for pl/de/es add the extra letters as a row beneath) where each key is tinted from `--surface` (no misses) to `--error` by miss rate, with a tooltip showing hits and misses. Show the "New personal best" text in `--caret` when it applies. A copy button (Copy icon) copies e.g. `ParroType · time 30 · en\n92 wpm · 97% acc · raw 98 · consistency 81%` (the middle dots are fine in plain text, not in the UI) and confirms with "Copied".
- Mobile: the hidden input must work with on-screen keyboards. Verify with Playwright mobile emulation (iPhone 13) using `page.keyboard.insertText` and the CDP `Input.imeSetComposition`/`Input.insertText` for composition.
- Command line: add commands for every new setting (pace caret → off/pb/average/custom wpm (a few presets: 40/60/80/100/120), tape mode toggle, sound → profiles, sound volume → 0.25/0.5/0.75/1, language → 4 languages, mode → daily/weak, "Copy last result" when a result exists (optional)).

### Pages
- `/u/:name` ProfilePage: the name, joined date, totals row, bests table (the same style as the account page), and recent results. 404 state: "No user with that name."
- Leaderboard: the mode filter adds `daily` (showing today's board, with yesterday available as a second pill). The language filter has 4 languages. Names link to `/u/:name`.
- Account: a "Settings" section with Change password (current + new + confirm) and Delete account (password + typing your username to confirm; red text button; after deletion go to / and clear the caches). Show a link to your public profile.
