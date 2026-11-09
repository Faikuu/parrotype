# ParroType

A minimal typing test, named after the bird that repeats what it hears. You type the text, it measures your speed, accuracy and rhythm, and keeps your history if you sign in.

![Typing test in the Kea theme](docs/screenshot-test.png)

| While typing | Results |
|---|---|
| ![Typing with a mistake underlined](docs/screenshot-typing.png) | ![Results with the per-second chart](docs/screenshot-results.png) |

## What it does

- **Multiplayer races.** Create a race, share the link, and up to eight people type the same quote live. Each player is a parrot moving along a lane. Guests can join with a nickname. The server checks every finish, so nobody can claim a time they didn't type.
- **Eight modes**: time (15/30/60/120 s), words (10/25/50/100), quote, zen (free typing, finish with Shift+Enter), pangram, custom text, **daily** and **weak keys**. Punctuation and numbers can be mixed into time and words tests.
- **Dynamic pangrams.** Pangram mode builds a fresh sentence that uses every letter of the alphabet, each time. It runs a randomised greedy set cover over the word list, keeps the shortest candidates and checks every result. Works in all four languages, including Polish ą–ż and German ä ö ü ß.
- **Daily challenge.** Everyone gets the same text for a given UTC date: a pangram followed by 40 words, generated from a seed. It has its own leaderboard, where your first attempt of the day is the one that counts.
- **Weak keys practice.** ParroType tracks which letters you miss, per language and stored locally, and builds tests around them. The results screen shows a keyboard heatmap of your misses.
- **Pace caret.** A faint second caret runs at your personal best, your recent average or a set speed.
- **Replays.** Watch any test play back keystroke by keystroke, at half, normal or double speed, with a scrubber.
- **Slowest words.** The results list the five words that cost you the most time, with one click to practise them.
- **Modifiers**: no backspace, and sudden death (the first mistake ends the test).
- **Tape mode** (one scrolling line), **typing sounds** (three synthesised profiles, no audio files), **copy result**, and a "New personal best" message that works without an account.
- **Command line.** Press `Esc`, `Ctrl/Cmd+Shift+P` or `Ctrl/Cmd+K` to search every setting and action: mode, time, language, theme (with a live preview), font, caret and pace caret, tape mode, sounds, blind mode, focus mode, stop on error, quick restart key, interface language, custom text and navigation. Searching at the top level also reaches nested options, so typing "cockatoo" finds the theme directly.
- **Results** with wpm, raw wpm, accuracy, consistency, a per-second chart with error markers, and character counts. Signed-in results are saved automatically.
- **Accounts**: personal bests per mode, a progress chart with a 10-test moving average, an activity calendar, a wpm histogram, speed by hour of day, streaks, 16 achievements, recent results, CSV/JSON export, password change and account deletion. Each user has a **public profile** at `/u/<name>`, and there's a **leaderboard** per mode and language.
- **Four languages to type in**: English, Polish, German and Spanish, each with word lists, pangrams and public-domain quotes. The interface is in English or Polish.
- **Eight themes named after parrots** (Kea, Kākāpō, Macaw, Cockatoo, Galah, Lorikeet, Budgie, Black Cockatoo), five monospace fonts, adjustable text size and caret style. You can also build your own theme with the theme editor (with a contrast check) and share it as a short code.
- **Works offline.** ParroType installs as an app (PWA), and the typing test keeps working without a connection.

### Keyboard

| Keys | Action |
|---|---|
| `Tab` then `Enter` | Restart (or next test on the results screen) |
| `Esc` / `Ctrl+Shift+P` / `Ctrl+K` | Open the command line |
| `Ctrl+Backspace` | Delete the current word |
| `Shift+Enter` | Finish a zen test |

## Stack

- **Frontend** (`stack/frontend`): React 19, Vite 6, TypeScript (strict), Tailwind 4, TanStack Query, zustand, react-i18next, chart.js. The typing engine is a pure reducer in `src/lib/engine` with its own test suite.
- **Backend** (`stack/backend`): NestJS 11, Prisma 6 and zod validation. Runs on SQLite (default), PostgreSQL or MySQL/MariaDB.

## Getting started

Requires Node 22+.

```bash
npm run setup
```

```bash
npm run dev
```

`setup` installs dependencies, creates `stack/backend/.env` with a random JWT secret, creates the SQLite database and seeds public-domain quotes. `dev` starts the API on http://localhost:3000 and the app on http://localhost:5173. Vite proxies `/api`, so cookies stay same-origin in development.

Other scripts:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

The backend also has end-to-end tests: `npm --workspace stack/backend run test:e2e`.

### Choosing a database

Set `DATABASE_PROVIDER` and `DATABASE_URL` in `stack/backend/.env`, then run `npm --workspace stack/backend run prisma:deploy` and `npm --workspace stack/backend run seed`.

| Provider | `DATABASE_PROVIDER` | Example `DATABASE_URL` |
|---|---|---|
| SQLite (default) | `sqlite` | `file:../dev.db` (relative to `prisma/sqlite/`) |
| PostgreSQL | `postgresql` | `postgresql://user:pass@localhost:5432/parrotype` |
| MySQL / MariaDB | `mysql` | `mysql://user:pass@localhost:3306/parrotype` |

The schema is written once in `prisma/schema.template.prisma` and rendered per provider. Each provider has its own committed migrations, so a fresh database needs only `prisma:deploy`. The API checks at startup that the URL matches the provider. The end-to-end suite runs against any of them with `E2E_DATABASE_PROVIDER` and `E2E_DATABASE_URL`, which must point at a database whose name contains `e2e` or `test`. More detail is in [stack/backend/README.md](stack/backend/README.md).

### Docker

`docker-compose.yml` runs PostgreSQL, the API and the web app (nginx). Put `JWT_SECRET` and `POSTGRES_PASSWORD` in a `.env` file next to it, then:

```bash
docker compose up -d --build
```

The app is served at http://localhost:8080. Only the web container is exposed. It serves the built app and proxies `/api` to the API.

## Security notes

- Sessions are HS256 JWTs in an httpOnly, SameSite=Lax cookie (`Secure` in production). Tokens are verified on every request and carry only the user id, name and a token version. Logging out bumps the version, which revokes every token issued before.
- Passwords are hashed with bcrypt (cost 12). Login gives the same error and takes the same time for an unknown email as for a wrong password.
- All input is validated with zod. Results also get a plausibility check, and zen, custom and weak-key results are kept out of the leaderboard.
- Rate limiting runs globally (100/min) and is tighter on login and register (10/min). Behind a reverse proxy, set `TRUST_PROXY` to the number of hops so limits apply per client.
- Races: WebSocket connections must come from an allowed origin. Room ids are random, rooms hold at most eight players and expire when idle, messages are size- and rate-limited, and progress and finishes are checked against server time.
- Exports escape spreadsheet formulas. Public profiles never include email addresses. Changing your password signs out your other devices, and deleting your account removes all your results.
- helmet headers, a CORS allowlist (`CORS_ORIGINS`), a 50 kB body limit, and the configuration is validated at startup (the API refuses to start with a JWT secret shorter than 32 characters).

## License

[MIT](https://choosealicense.com/licenses/mit/)
