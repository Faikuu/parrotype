# ParroType 2.2 — addendum

SPEC.md and SPEC-2.1.md still hold, and the design rules are unchanged. Packages already installed (don't install more): backend `@nestjs/websockets`, `@nestjs/platform-ws`, `ws`, `@types/ws`; frontend `vite-plugin-pwa`.

## Features
1. **Multiplayer races**: create a room, share the link, up to 8 people race the same quote live.
2. **Replays**: watch your test play back keystroke by keystroke on the results screen.
3. **Slowest words**: the 5 slowest words of a test, with "Practice these words".
4. **Modifiers**: `noBackspace` and `suddenDeath` (the first error fails the test).
5. **Custom theme editor**: 8 colour pickers, live preview, export/import as a short code.
6. **PWA**: installable, and the app shell works offline (anonymous typing).
7. **Streaks and achievements**, computed server-side from results.
8. **Insights**: an activity calendar (the last 365 days), a wpm histogram, and average wpm by hour of day.
9. **Export**: download your results as CSV or JSON.

---

## Backend

### Races (new module `src/races`)
- `POST /api/races` body `{ language: Language }` → `201 { id }`. Auth is optional. Throttled to 10/min per IP.
  - Room id: 8 chars from crypto randomBytes, base32 lowercase without the ambiguous characters.
  - The server picks a random quote in that language from the Quote table (any length ≤ 300 chars).
- WebSocket gateway via `@nestjs/platform-ws` (`app.useWebSocketAdapter(new WsAdapter(app))` in main.ts and the e2e setup), at the path **`/api/races/ws`**. Gateways don't get the global prefix, so set the path explicitly.
- **Origin check on upgrade**: reject connections whose `Origin` header isn't in CORS_ORIGINS (prevents cross-site WebSocket hijacking). In tests, allow the configured origin.
- **Identity**: if the upgrade request carries a valid `pt_session` cookie, the player's name is the account name and `userId` is set. Otherwise the client sends a guest nickname in `join` (`/^[a-zA-Z0-9_ ]{2,20}$/`, trimmed). Guests are prefixed "guest " in the display name, so they can't impersonate accounts.
- **Limits**:
  - Rooms: max 8 players per room, max 500 rooms in memory, TTL 30 min of inactivity, swept every minute.
  - Messages: max 4 KB per message and 30 messages/sec per connection (excess messages are dropped; 3 strikes → close with 1008).
  - Inputs: everything is validated with zod, and unknown message types get an error reply.
- **Protocol** (JSON text frames):
  - Client → server:
    - `{ type: 'join', room: string, name?: string }`
    - `{ type: 'start' }` (host only; the lobby needs ≥ 1 player; a solo race is allowed)
    - `{ type: 'progress', chars: number, wpm: number }` (chars = correct chars typed so far; the server clamps it to the text length, only lets it increase, and drops wpm > 350)
    - `{ type: 'finish', wpm: number, accuracy: number, durationMs: number }`
    - `{ type: 'leave' }`
  - Server → client:
    - `{ type: 'joined', you: playerId }`
    - `{ type: 'room', room: RoomView }` (broadcast on every change, throttled to ≤ 10/sec per room)
    - `{ type: 'error', message: string }`
  ```ts
  type RoomView = {
    id: string; language: Language; status: 'lobby' | 'countdown' | 'racing' | 'finished';
    hostId: string; text: string | null;        // null until the countdown starts (no peeking in the lobby)
    source: string | null; startsAt: number | null; // epoch ms when typing may begin (countdown 3s)
    players: Array<{ id: string; name: string; isGuest: boolean; progress: number /*0..1*/; wpm: number; finished: boolean; place: number | null; accuracy: number | null; connected: boolean }>;
  };
  ```
  - Server-side timing: `finish` is only accepted when `chars === text.length` and `now - startsAt >= durationMs - 500`. The server records `place` in finish order. The race ends when everyone connected has finished, or 3 min after the start.
  - When the host leaves, the next player becomes host. A finished room can be restarted by the host with `start` (new quote, everyone's progress reset).
  - Race results aren't saved to the results table (unranked fun).
- Vite dev proxy: `/api` with `ws: true`. nginx: `location /api/races/ws` with the Upgrade/Connection headers.
- Tests: unit tests for the room service (join/leave/host transfer/limits/progress clamping/finish validation/places), and an e2e test with the `ws` client: create a room, two clients join, start, progress, finish, places; a bad origin is rejected; the 9th player is rejected.

### Insights, achievements, export (`src/results`, `src/users`)
- `GET /api/results/me/insights` (auth) → `Insights`:
  ```ts
  type Insights = {
    streak: { current: number; longest: number };   // consecutive UTC days with ≥1 test; current counts today or yesterday
    activity: Array<{ date: string; tests: number }>; // last 365 UTC days, only days with tests
    histogram: Array<{ from: number; count: number }>; // wpm buckets of 10 (0,10,20,…)
    byHour: Array<{ hour: number; tests: number; avgWpm: number }>; // 0–23 UTC
    achievements: Array<{ id: AchievementId; unlockedAt: string }>;
  };
  type AchievementId = 'first_test' | 'tests_100' | 'tests_1000' | 'wpm_60' | 'wpm_80' | 'wpm_100' | 'wpm_120' | 'wpm_150'
    | 'perfect' /* 100% acc on a test with ≥ 125 correct chars */ | 'marathon' /* a time 120 test */
    | 'polyglot' /* tests in all 4 languages */ | 'pangram_hunter' /* pangram tests in ≥ 2 languages */
    | 'daily_first' /* any daily */ | 'streak_3' | 'streak_7' | 'streak_30';
  ```
  - unlockedAt = the createdAt of the result that first satisfied it (for streaks, the day it was reached).
  - Load only the needed columns, capped at the most recent 20,000 results. The computation is pure functions in `src/results/insights.ts`, unit-tested.
- `GET /api/users/:name` additionally returns `streak`, `achievements` and `activity` (public).
- `GET /api/results/me/export?format=csv|json` (auth) sends `Content-Disposition: attachment; filename="parrotype-results.<ext>"`. Columns: createdAt, mode, mode2, language, wpm, rawWpm, accuracy, consistency, durationMs, correct, incorrect, extra, missed, punctuation, numbers. CSV: RFC 4180 quoting, and every cell starting with `= + - @` or a tab is prefixed with `'` (formula injection). Throttled to 5/min.

---

## Frontend lib (`src/lib/engine`)
- **Event log for replays**: `EngineState.events: EngineEvent[]`, where `EngineEvent = { t: number /*ms since start*/; k: 'c' | 's' | 'b' | 'B' | 'n'; ch?: string }` (char, space, backspace, word-backspace, newline). It records every accepted input action after the start (including the first char, at t = 0).
- `lib/engine/replay.ts`: `replayStateAt(config, words, events, t): EngineState` re-runs the reducer from a fresh state over the events with `e.t <= t` (using synthetic `at` = startedAt + e.t). Plus `replayDuration(events)`. It must reproduce the final state exactly (test: the replay at the end equals the real final typed[]).
- **Word timings**: `lib/engine/words.ts` (or timings.ts): `wordTimings(state): Array<{ index: number; word: string; ms: number; wpm: number; correct: boolean }>`, where the time per word runs from the first keystroke of the word to the keystroke that left it (the space) or the finish. The first word starts at its first char. `slowestWords(state, n = 5)` uses only completed, correct words with length ≥ 2, sorted by wpm ascending.
- **Modifiers**: `TestConfig` gains `noBackspace: boolean` and `suddenDeath: boolean` (default false everywhere configs are built).
  - noBackspace makes backspace/word-backspace no-ops.
  - suddenDeath: the first incorrect char (or an extra char) finishes the test immediately with `state.failed = true`.
  - `EngineState.failed: boolean`, and `TestResult.failed`.

## Frontend UI
- **Settings**: `noBackspace`, `suddenDeath` (persisted; part of selectTestConfig); `customTheme: { bg, surface, text, sub, main, caret, error, errorExtra } | null` (hex validated `/^#[0-9a-f]{6}$/i`); `theme` may be `'custom'`.
- **ConfigBar**: a compact modifiers toggle group (icons + labels: "no backspace", "sudden death") shown for every mode except zen, plus the command line entries.
- **Results**:
  - "Failed" state for sudden death: show "Failed at word N"; not saved, with the reason shown.
  - **Replay**: a "Watch replay" button opens an inline player above the stats. It renders Words + Caret driven by `replayStateAt`, with play/pause, speed 0.5×/1×/2×, a scrubber (input range, accessible label) and the elapsed time. Use requestAnimationFrame and clean up.
  - **Slowest words**: a list (word + wpm), and a "Practice these words" button that sets customText to the words repeated to about 30 words, switches to custom mode and restarts.
- **Theme editor**: `/settings/theme` or a modal from the command line ("Theme → Customise…"). 8 labelled `<input type=color>` fields starting from the current theme, a live preview (applied to the page while editing; revert on cancel), Save (stores customTheme and sets theme 'custom'), Export (copies a code `pt1.` + base64url(JSON)), and Import (a paste field, validated, with an error message on bad input). Contrast hint: warn when text/bg or sub/bg contrast is < 4.5 / 3 (WCAG formula).
- **PWA**: vite-plugin-pwa with `registerType: 'autoUpdate'`, a manifest (name ParroType, theme colour the Kea bg, icons generated from public/logo.jpeg is fine, or provide an SVG icon of the parrot mark at 192/512 as PNG via the existing logo), workbox precache of the app shell, and **no caching of /api** (NetworkOnly). Make sure the nginx CSP allows the service worker (`worker-src 'self'`) and the manifest. Offline: the test page works without the backend (it already falls back), and quote mode falls back to the built-in quotes.
- **Race UI** (`src/features/race`):
  - `/race`: a "Create a race" page with a language picker. On create, navigate to `/race/:id`.
  - `/race/:id`: guests see a nickname field first (remembered in localStorage). Then the lobby: the player list, a copy-link button, and "Start race" for the host ("Waiting for the host to start" for others).
  - Countdown: 3-2-1 in a big --main number.
  - Race: the lanes, one per player. Each lane is a thin --surface track with a small parrot-head mark in --caret (others in --sub) that moves with progress, plus the name and live wpm. Below the lanes, your own typing area using the engine in quote mode with the room text (reuse the Words and Caret components, but write a small input hook rather than reusing useTypingTest). Progress is sent at most every 200ms and on finish.
  - Finished: a placements table (place, name, wpm, accuracy), with "Race again" for the host.
  - Reconnects with backoff when the socket drops. Clear error states: "This race is full", "Race not found", "Couldn't connect to the race server".
  - Header nav gets a Race icon link (Flag or Users icon).
- **Pages**:
  - Account: an **Insights** section with an activity calendar (a GitHub-style grid of the last 53 weeks, cells tinted from --surface to --main by test count, a tooltip with the date and count, an accessible table fallback via `<details>`), a wpm histogram (a chart.js bar chart in --main), and a small "by hour" bar chart; a streak line ("Current streak 4 days, longest 12"); an **Achievements** grid (unlocked in --text with the date, locked in --sub at 50%, each with a name + one-line description); and **Export** buttons (CSV, JSON) that download via fetch + blob.
  - Profile: streak, achievements (unlocked only) and the activity calendar.
- All new strings in en + pl.
