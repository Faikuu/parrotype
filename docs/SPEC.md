# ParroType v2 — build spec

This is the contract every part of the rewrite builds against. If you change something in it, say so.

Monorepo with npm workspaces: `stack/backend` (NestJS 11 + Prisma 6 + SQLite) and `stack/frontend` (Vite 6 + React 19 + TS strict + Tailwind 4).
Node 22. All code is TypeScript `strict`. No `any` unless it's unavoidable, and then with a comment.

---

## 1. Backend (`stack/backend`)

### Stack
- NestJS 11, `@nestjs/jwt`, `@nestjs/throttler`, `helmet`, `cookie-parser`, `bcrypt` (cost 12), `zod` for validation (a small custom `ZodValidationPipe`, no nestjs-zod), Prisma 6 with **SQLite** (`DATABASE_URL="file:./dev.db"`).
- Drop: Redis, express-session, passport, passport-local, connect-redis, cache-manager, class-validator, prisma-docs-generator, and the global CacheInterceptor (it served one user's data to another).
- Env is validated at startup with zod (`src/config/env.ts`), and the app fails fast if anything is missing:
  `DATABASE_URL`, `JWT_SECRET` (min 32 chars), `CORS_ORIGINS` (comma-separated, default `http://localhost:5173`), `PORT` (default 3000), `NODE_ENV`, `COOKIE_SECURE` (bool, default true when NODE_ENV=production).
- Global prefix `/api`. `helmet()`. Express body limit 50kb. `app.enableShutdownHooks()`.
- CORS: `origin` = the allowlist from `CORS_ORIGINS`, `credentials: true`.
- Throttler: 100 requests/min globally, and `@Throttle` 10/min on login and register.

### Auth
- Session = a JWT (HS256, `JWT_SECRET`, 7d) with payload `{ sub: userId, name }`. **Never put the password or email in the token.**
- Stored in the httpOnly cookie `pt_session`: `sameSite: 'lax'`, `secure: COOKIE_SECURE`, `path: '/'`, maxAge 7d.
- `JwtAuthGuard` reads the cookie and **verifies** it with `JwtService.verifyAsync`, then sets `req.user = { id, name }`. `OptionalJwtAuthGuard` does the same but doesn't throw.
- Login gives the same generic 401 `"Invalid email or password"` whether the email is unknown or the password is wrong (no user enumeration). Always run bcrypt compare, against a dummy hash when the user doesn't exist.
- Register: name is `/^[a-zA-Z0-9_]{3,20}$/`, email is a valid email (lowercased, trimmed, max 254), password is 8–72 chars. A duplicate name or email gives 409 `"Username or email is already taken"`.

### Data model (Prisma, SQLite)
```prisma
model User {
  id           Int      @id @default(autoincrement())
  name         String   @unique
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  results      Result[]
}
model Quote {
  id       Int    @id @default(autoincrement())
  language String           // "en" | "pl"
  text     String
  source   String
  length   Int              // text length in chars
  @@index([language])
}
model Result {
  id           Int      @id @default(autoincrement())
  userId       Int
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  mode         String   // time|words|quote|zen|pangram|custom
  mode2        String   // "15" | "60" | "25" | "short" | "3" | "custom" ...
  language     String
  wpm          Float
  rawWpm       Float
  accuracy     Float
  consistency  Float
  durationMs   Int
  correctChars Int
  incorrectChars Int
  extraChars   Int
  missedChars  Int
  punctuation  Boolean
  numbers      Boolean
  createdAt    DateTime @default(now())
  @@index([userId, createdAt])
  @@index([mode, mode2, language, wpm])
}
```
Delete the old MySQL migrations and make a fresh SQLite migration. Add `prisma/seed.ts` that seeds about 40 English and about 20 Polish quotes. **Public domain only**: pre-1929 authors (Austen, Twain, Thoreau, Dickens, Wilde, Emerson, Mickiewicz, Prus, Sienkiewicz, Orzeszkowa…) or traditional proverbs. Mix short (<100 chars), medium (100–250) and long (>250).

### Endpoints (all JSON, no response wrapper; errors are Nest's default `{ statusCode, message, error }`)
| Method | Path | Auth | Body / query | Response |
|---|---|---|---|---|
| GET | `/api/health` | – | – | `{ ok: true }` |
| POST | `/api/auth/register` | – | `{ name, email, password }` | `201 { user: PublicUser }` + sets cookie |
| POST | `/api/auth/login` | – | `{ email, password }` | `{ user: PublicUser }` + sets cookie |
| POST | `/api/auth/logout` | – | – | `{ ok: true }` (clears cookie with the same options) |
| GET | `/api/auth/me` | required | – | `{ user: PublicUser }` |
| GET | `/api/quotes/random` | – | `?language=en&length=short\|medium\|long\|any` | `Quote` (`{id, language, text, source, length}`), 404 if none |
| POST | `/api/results` | required | `ResultInput` | `201 Result` |
| GET | `/api/results/me` | required | `?limit=50` (1–200) | `Result[]` newest first |
| GET | `/api/results/me/summary` | required | – | `Summary` |
| GET | `/api/leaderboard` | – | `?mode=time&mode2=60&language=en` | `LeaderboardEntry[]` (top 50; each user's best wpm; ties broken by earlier date) |

```ts
type PublicUser = { id: number; name: string; email: string; createdAt: string };
type ResultInput = {
  mode: 'time'|'words'|'quote'|'zen'|'pangram'|'custom';
  mode2: string;            // max 16 chars
  language: 'en'|'pl';
  wpm: number;              // 0..350
  rawWpm: number;           // 0..400
  accuracy: number;         // 0..100
  consistency: number;      // 0..100
  durationMs: number;       // int, 1000..3_600_000
  charStats: { correct: number; incorrect: number; extra: number; missed: number }; // ints >= 0
  punctuation: boolean; numbers: boolean;
};
// Server-side sanity check: reject (400) if wpm > rawWpm + 0.5, or if
// correct chars/5/(durationMs/60000) is wildly off from wpm (more than wpm*1.5+10).
// Reject mode 'zen' and 'custom' from leaderboard queries (they can still be saved).
type Summary = {
  totalTests: number; totalTimeMs: number;
  averageWpm: number; averageAccuracy: number;      // over the last 10
  bests: Array<{ mode: string; mode2: string; language: string; wpm: number; accuracy: number; createdAt: string }>; // best per (mode,mode2,language)
};
type LeaderboardEntry = { rank: number; name: string; wpm: number; rawWpm: number; accuracy: number; createdAt: string };
```

### Tests
Jest unit tests for AuthService (register/login/no enumeration), the result validation schema and the leaderboard ranking. One e2e test (supertest, separate SQLite file `test.db`) covering register → me → submit result → summary → logout → me is 401.

---

## 2. Frontend (`stack/frontend`)

### Stack (scaffold already in place)
React 19, react-router 7 (`react-router` package, declarative `<BrowserRouter>`/`<Routes>`), TanStack Query 5, zustand 5 (settings store, persisted), i18next + react-i18next (en, pl), Tailwind 4 via `@tailwindcss/vite`, lucide-react icons, chart.js 4 + react-chartjs-2, vitest + @testing-library/react + jsdom, `@fontsource` fonts.
Path alias `@/` → `src/`.
API base: `import.meta.env.VITE_API_URL ?? '/api'`. The Vite dev server proxies `/api` to `http://localhost:3000`, so cookies are same-origin in dev.

### Directory layout
```
src/
  main.tsx, App.tsx (routes), index.css (Tailwind + theme tokens)
  lib/
    text/       wordlists/en.ts, wordlists/pl.ts, generator.ts, pangram.ts, rng.ts      (agent B)
    engine/     types.ts, engine.ts, stats.ts                                           (agent B)
    api/        client.ts, endpoints.ts, types.ts                                       (agent C)
  store/        settings.ts                                                              (agent C)
  themes/       themes.ts                                                                (agent C)
  features/
    commandline/  CommandLine.tsx, commands.ts, fuzzy.ts, useCommandLine.ts             (agent C)
    test/         TypingTest.tsx, Words.tsx, Caret.tsx, ConfigBar.tsx, LiveStats.tsx, Results.tsx, useTypingTest.ts (agent D)
    auth/         LoginPage.tsx, RegisterPage.tsx, useAuth.ts                            (C makes useAuth, E makes pages)
    account/      AccountPage.tsx                                                        (agent E)
    leaderboard/  LeaderboardPage.tsx                                                    (agent E)
  components/   Layout.tsx, Header.tsx, Footer.tsx, Kbd.tsx, Button.tsx …               (agent C)
  i18n/         index.ts, en.json, pl.json                                               (C owns; others ADD keys under their own namespace)
```
i18n namespaces: `common`, `nav`, `commands`, `settings` (C); `test`, `results` (D); `auth`, `account`, `leaderboard` (E). Every user-visible string goes through `t()`. Add each key to **both** en.json and pl.json.

### Engine contract (agent B implements, agent D consumes). Must be pure, no React.
```ts
// lib/engine/types.ts
export type Mode = 'time' | 'words' | 'quote' | 'zen' | 'pangram' | 'custom';
export type Language = 'en' | 'pl';
export type TimeOption = 15 | 30 | 60 | 120;
export type WordsOption = 10 | 25 | 50 | 100;
export type QuoteLength = 'short' | 'medium' | 'long' | 'any';
export type PangramCount = 1 | 3 | 5;

export interface TestConfig {
  mode: Mode; time: TimeOption; words: WordsOption; quoteLength: QuoteLength;
  pangramCount: PangramCount; punctuation: boolean; numbers: boolean;
  language: Language; customText: string;
  stopOnError: 'off' | 'letter' | 'word';
}
export type CharState = 'pending' | 'correct' | 'incorrect' | 'extra' | 'missed';
export interface Keystroke { at: number; correct: boolean }      // ms timestamps
export interface SecondSample { second: number; wpm: number; raw: number; errors: number }
export interface EngineState {
  status: 'idle' | 'running' | 'finished';
  config: TestConfig;
  words: string[];          // target words
  typed: string[];          // typed[i] = what the user typed for word i ('' for current if nothing yet)
  current: number;          // index of the active word
  startedAt: number | null; finishedAt: number | null;
  keystrokes: Keystroke[];
  samples: SecondSample[];  // one per elapsed whole second, pushed on 'tick'
  errorsThisSecond: number;
}
export type EngineAction =
  | { type: 'reset'; words: string[]; config: TestConfig }
  | { type: 'char'; char: string; at: number }     // any printable char except space; starts the test if idle
  | { type: 'space'; at: number }
  | { type: 'backspace'; at: number; word?: boolean }   // word=true => ctrl/alt+backspace clears the word
  | { type: 'newline'; at: number }                // zen: shift+enter finishes; other modes ignore
  | { type: 'tick'; at: number }                   // called by the UI ~every 100ms while running; records samples, finishes time mode
  | { type: 'append'; words: string[] }            // infinite modes (time, zen-not-needed)
  | { type: 'finish'; at: number };
export interface TestResult {
  wpm: number; rawWpm: number; accuracy: number; consistency: number; durationMs: number;
  charStats: { correct: number; incorrect: number; extra: number; missed: number };
  samples: SecondSample[];
}
```
`lib/engine/engine.ts` exports:
- `createInitialState(config: TestConfig, words: string[]): EngineState`
- `engineReducer(state, action): EngineState`
- `getCharStates(state, wordIndex): { char: string; state: CharState }[]` (target chars, then extra typed chars as `extra`; on a past word, untyped target chars are `missed`)
- `isWordCorrect(state, i): boolean`
- `needsMoreWords(state): boolean` (true when `words.length - current < 40` in time mode)
- `elapsedMs(state, now): number`, `timeLeftMs(state, now): number | null` (null if not time mode)

Rules (monkeytype-style):
- The test starts on the first `char`. `space` on an empty current word does nothing. `space` moves to the next word; untyped chars of the word left behind count as missed.
- At most 20 extra chars per word.
- `backspace` on an empty word goes back to the previous word **only if** that word isn't correct, and restores its typed text.
- `stopOnError: 'letter'`: a wrong char is recorded as a keystroke error but not inserted. `'word'`: space is blocked while the word is wrong.
- Finishing: in time mode on `tick` when elapsed >= time. In words/quote/pangram/custom when the last char of the last word is typed and the word is correct, or on space on the last word. In zen mode on `newline`. Also on the explicit `finish` action.
- In zen mode there are no target words: the typed text is the target (everything counts as correct). Represent it by appending to `words` as you type, so `words[i] === typed[i]`.
- Every `char` adds a Keystroke (correct = char matches the target at that position).

`lib/engine/stats.ts`: `computeResult(state): TestResult`
- wpm = (chars in correctly typed words + one space per correct word except the last) / 5 / minutes. A partially typed last word counts its correct chars if it's a correct prefix.
- raw = (all typed chars + spaces) / 5 / minutes.
- accuracy = correct keystrokes / total keystrokes × 100 (100 when there are none).
- consistency = clamp(100 × (1 − stddev/mean) of samples' raw wpm, 0, 100), and 100 if there are fewer than 2 samples.
- Round wpm/raw/accuracy/consistency to 2 decimals.

### Text generation (agent B)
- `lib/text/rng.ts`: `createRng(seed?: number): () => number` (mulberry32). Everything that's random takes an optional `rng`.
- `wordlists/en.ts`, `wordlists/pl.ts`: about 500 common lowercase words each (Polish with diacritics). Make sure every letter of the alphabet shows up in several words (en: include quiz, jazz, vex, fjord, wax, jumpy, zephyr, quick, box, kayak…; pl: include ą ć ę ł ń ó ś ź ż words).
- `generator.ts`:
  - `generateWords(config: TestConfig, count: number, rng?): string[]` handles random words; if `numbers`, about 10% of words become numbers (1–4 digits); if `punctuation`, sentences are capitalised and end with . ? !, and there are commas, the odd quoted word, a hyphen, etc. Never the same word twice in a row.
  - `wordsForConfig(config, rng?): string[]`: the initial word list for every mode except quote (time → 100 words, words → N, pangram → `generatePangrams`, custom → split customText on whitespace, falling back to a default sentence if empty, zen → []).
  - `quoteToWords(text: string): string[]`.
- `pangram.ts` **(the dynamic pangram generator, a headline feature)**:
  - `ALPHABETS: Record<Language, string>` (en: a–z; pl: aąbcćdeęfghijklłmnńoóprsśtuwyzźż, no q/v/x).
  - `isPangram(text, language): boolean`, `missingLetters(text, language): string[]`.
  - `generatePangram(language, rng?, opts?: { attempts?: number }): string`: randomised greedy set cover over the word list. On each step pick a word with probability weighted by (newly covered letters)² ÷ length, among words that cover at least 1 new letter, until all letters are covered. Run `attempts` (default 60) trials and return one of the 3 shortest (by total chars), chosen at random. Then shuffle the word order so rare-letter words don't cluster at the end, and capitalise the first letter + end with "." when `punctuation` is passed in opts. **Must always return a real pangram** (assert with isPangram; throw if the word list can't cover the alphabet).
  - `generatePangrams(language, count, opts) : string[]` returns the words of `count` pangrams joined.
- Tests (vitest, `*.test.ts` next to the source): every generated pangram (try 200 seeds per language) passes `isPangram`; the word lists cover their alphabet; the engine reducer is covered across all the rules above; stats math is checked with known inputs.

### Settings store (agent C) `store/settings.ts`
zustand + `persist` (localStorage key `parrotype:settings`; wrap the storage in try/catch so it works when localStorage throws).
```ts
interface Settings extends TestConfig {
  theme: ThemeId; font: FontId; fontSize: 1 | 1.25 | 1.5 | 2 | 2.5 | 3;  // rem multiplier for the test text
  caretStyle: 'line' | 'block' | 'underline' | 'off'; smoothCaret: boolean;
  liveStats: 'wpm' | 'acc' | 'both' | 'off'; blindMode: boolean; focusMode: boolean; // focusMode hides chrome while typing
  quickRestart: 'tab' | 'esc' | 'off';
  uiLanguage: 'en' | 'pl';
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  setMany: (p: Partial<Settings>) => void;
  reset: () => void;
}
```
Export `useSettings` and `selectTestConfig(s): TestConfig`.
Also `store/ui.ts` (not persisted): `{ commandLineOpen, openCommandLine(initialPath?: string), closeCommandLine, isTyping, setTyping, previewTheme: ThemeId | null, setPreviewTheme, restartToken: number, restart() }`. `restart()` bumps the token, and the typing test listens to it.

### Themes (agent C) `themes/themes.ts`
Each theme is named after a parrot. Tokens are CSS custom properties set on `<html data-theme>`:
`--bg`, `--surface` (raised areas, palette), `--text` (correctly typed), `--sub` (untyped / secondary text), `--main` (accent), `--caret`, `--error`, `--error-extra`.
Tailwind 4 `@theme` maps them to `bg-bg`, `text-sub`, `text-main` etc.

| id | name | feel | bg | surface | text | sub | main | caret | error | error-extra |
|---|---|---|---|---|---|---|---|---|---|---|
| kea (default) | Kea | dark olive, underwing orange | #1d2119 | #272c22 | #e4e3d3 | #6f7562 | #9db35f | #f0782f | #e0525a | #8f3a3f |
| kakapo | Kākāpō | night moss | #142019 | #1c2b22 | #d8e8c8 | #5d7a63 | #b9d36c | #e9d86a | #e8746a | #9c4942 |
| macaw | Macaw | deep blue, scarlet, gold | #0f1f3a | #172a4c | #f2ead8 | #5b6f96 | #ffc93c | #ff3b3b | #ff6b6b | #a33a3a |
| cockatoo | Cockatoo | light, cool grey, sulphur crest | #e6e9ec | #d8dde2 | #2a3138 | #8b949d | #c99a00 | #2a3138 | #c4303a | #e08a90 |
| galah | Galah | dusk pink and grey | #3a3439 | #463f45 | #f5dce4 | #9a8b93 | #ef8fae | #f6b8cc | #ff5f6d | #a8434c |
| lorikeet | Lorikeet | violet, lime, orange | #1e1640 | #2a2056 | #ece6ff | #7a6fb0 | #a6e22e | #ff8c2b | #ff4d6d | #a03a52 |
| budgie | Budgie | soft sky, yellow face | #dfeef6 | #cde3ef | #1d3a4f | #7c97a9 | #2f8fd0 | #e5b400 | #d1495b | #e8909b |
| cacatua-noir | Black Cockatoo | near-black and crimson tail | #121212 | #1d1b1b | #e8e2e2 | #625b5b | #d33a3a | #f2c14e | #ff6060 | #8a3030 |

Fonts (`FontId`): `spline` (Spline Sans Mono, default for the test text), `redhat` (Red Hat Mono), `atkinson` (Atkinson Hyperlegible Mono), `fragment` (Fragment Mono), `sometype` (Sometype Mono). The UI font is always **Familjen Grotesk**. Load them through `@fontsource/*` imports (agent C).

### Command line (agent C), monkeytype-style command popup
- Opens with **Esc** (when quickRestart ≠ 'esc'), **Ctrl/Cmd+Shift+P**, **Ctrl/Cmd+K**, or the footer button. Closes with Esc or a click outside.
- It's a centered panel near the top: a search input, then a list grouped and filtered with a fuzzy matcher (`fuzzy.ts`: subsequence match with a score, highlights the matched chars; unit-tested).
- Arrow keys / Ctrl+J/K / Tab move, Enter runs, Backspace on an empty query goes up a level, and the breadcrumb shows the path.
- `commands.ts` exports `buildCommands(ctx): Command[]`:
```ts
interface Command {
  id: string; label: string;            // already translated
  icon?: LucideIcon; hint?: string;     // e.g. current value or shortcut
  keywords?: string[];
  active?: boolean;                     // shows a check (current value)
  run?: () => void;                     // leaf; closes the palette unless keepOpen
  keepOpen?: boolean;
  children?: () => Command[];           // submenu
  onPreview?: () => void;               // called when highlighted (theme preview); onPreviewEnd when the palette closes / highlight moves away
}
```
- Required commands: Mode → (time/words/quote/zen/pangram/custom), Time → 15/30/60/120, Words → 10/25/50/100, Quote length, Pangram count → 1/3/5, Toggle punctuation, Toggle numbers, Language → en/pl, Theme → each theme (with **live preview while highlighted**, reverting on cancel), Font, Font size, Caret style, Smooth caret toggle, Live stats, Blind mode, Focus mode, Stop on error, Quick restart key, Interface language, Custom text… (opens a modal/textarea to set customText and switches mode to custom), Restart test, Random theme, Go to → Test / Account / Leaderboard / Login / Register (depending on auth state), Log out (when logged in), Reset settings (asks for confirmation through a child "Yes, reset").
- Accessibility: `role="dialog"` with `aria-modal`, the input has `role="combobox"`, the list is `role="listbox"`, options are `role="option"` with `aria-selected`. Focus is trapped and restored on close.

### API client (agent C) `lib/api`
`client.ts`: `api<T>(path, { method, body, signal })` using fetch with `credentials: 'include'` and a JSON body. Throws `ApiError { status, message }` (message from the server's `message`; when it's an array, join it). `types.ts` mirrors the backend types above. `endpoints.ts`: `authApi.{register,login,logout,me}`, `quotesApi.random`, `resultsApi.{submit,mine,summary}`, `leaderboardApi.get`.
`features/auth/useAuth.ts`: `useAuth()` returns `{ user, isLoading, login, register, logout }` built on TanStack Query (`['me']`; a 401 means `user = null`, no retry).

### Design direction (everyone working on UI follows this)
Subject: a typing test named after the parrot, the bird that repeats what it hears. You repeat text. The audience is people who practise typing every day. Its job is to get out of the way and make the text and your rhythm the whole screen.
- **The one bold element is the caret.** It's thick (3px line, rounded) in `--caret` and glides smoothly between letters (CSS transform transition, about 90ms, linear). When idle it gently "breathes" (opacity pulse 1s). It stops pulsing while you type. Everything else stays quiet.
- Typography: the test text is set in the selected mono font at `calc(1.5rem * fontSize)`, line-height 1.6, letter-spacing 0.01em. The UI is in Familjen Grotesk at 0.95rem, sentence case everywhere, **no all-caps labels, no tracked-out eyebrows, no middle-dot meta strings, no "→" on buttons**.
- Untyped text is `--sub`, correct text is `--text`, wrong letters are `--error`, extra letters are `--error-extra`, and a word with a mistake you've left behind gets a 2px wavy underline in `--error`.
- Layout: one centered column, max-width 1080px, 16px side gutter on mobile.
  ```
  ┌──────────────────────────────────────────────────────────┐
  │ parrotype (wordmark)                     ⌨ test  ♛ board  👤 │  header
  │                                                          │
  │        [punct] [numbers] │ time words quote zen pangram custom │ 15 30 60 120 │   config bar (pill group, fades when typing)
  │                                                          │
  │   47                                    (live stat, --main, big tabular nums, top-left of text)
  │   the quick words appear here in three visible lines of │
  │   text and scroll up line by line as you type along and │
  │   the caret glides between letters like a little bird   │
  │                                                          │
  │                         ↻ (restart icon button)           │
  │                                                          │
  │ tab + enter  restart     esc  commands        kea  v2.0.0│  footer: key hints with <Kbd>, current theme (click opens theme picker)
  └──────────────────────────────────────────────────────────┘
  ```
- Only 3 lines of the word area are visible. The text scrolls by whole lines (translateY) when the caret reaches line 3.
- Config bar: small text in `--sub`, the active option in `--main`, groups separated by a thin 1px `--surface` divider, background `--surface` at 60% with a 10px radius. It fades to opacity 0 (pointer-events none) while typing when focusMode is on, and to 0.35 otherwise.
- Results screen: a big wpm number (5rem, `--main`, tabular figures) with acc beside it, then a small row of secondary stats (raw, consistency, characters as `correct/incorrect/extra/missed` with a tooltip, time, mode label). Then a line chart of wpm and raw per second (wpm line in `--main`, raw in `--sub`, error points as small `--error` crosses), axes in `--sub`, no grid clutter. Actions: next test (Tab+Enter), repeat the same text, save status ("Saved" / "Log in to save your results" link).
- Corners: 10px for panels, 6px for pills and buttons, full radius only for the round icon buttons. No drop shadows except the command line (one soft shadow, `0 20px 60px -20px rgb(0 0 0 / .5)`). No gradients.
- Motion: only the caret glide/breathe, the line scroll, the config bar fade and the command line open (120ms scale .98→1 + fade). Respect `prefers-reduced-motion` (turn off smooth caret and breathing).
- Visible focus rings: `outline: 2px solid var(--main); outline-offset: 2px` on `:focus-visible`.
- Copy: plain and specific. Examples: "Log in to save your results", "No results yet. Finish a test and it shows up here.", "Couldn't reach the server. Check that the backend is running."
