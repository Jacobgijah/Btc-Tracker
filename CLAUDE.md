# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal, single-user Bitcoin savings tracker. Buys happen in TZS and USD; P/L is reported in both. `server/` (Node ≥ 20, ESM, Express 5, Prisma 6, PostgreSQL 16, zod, decimal.js, vitest) and `client/` (Vite, React 19, TypeScript, React Router, TanStack Query, Tailwind 4, react-hook-form + zod, decimal.js; see `client/README.md`). Root `npm run dev` runs both via concurrently; Vite proxies `/api/*` to the server with the prefix stripped. Client rules: no floats for money (decimal.js / BigInt sats), all display formatting in `client/src/lib/format.ts`, all HTTP in `client/src/lib/api.ts`; client checks: `npm test` (runs `lint:colors` first), `npm run lint` (oxlint, warnings fail), `npm run build`. Client theme: dark only, six brand tokens in `client/src/theme/tokens.css` (+ `tokens.ts` for charts); components use the semantic aliases (`bg`, `surface`, `text`, `text-muted`, `border`, `accent`, `info`, `gain`, `loss`, `warning`, `error`...), never raw colours; blue is never normal-size text; all P/L via `Pnl` in `components/ui.tsx`. `README.md` is the authoritative API/behaviour spec (endpoints, field rules, error shapes, worked examples) — keep it in sync when behaviour changes.

## Commands

Run from `server/` unless noted.

```bash
docker compose up -d          # (repo root) Postgres 16; POSTGRES_PORT in root .env overrides host port
npm run dev                   # nodemon, http://localhost:4000, also starts the price job
npm run db:migrate            # prisma migrate dev (create/apply migrations on the dev DB)
npm run db:seed               # upsert the single user from ADMIN_EMAIL/ADMIN_PASSWORD + default settings
npm test                      # unit + integration
npm run test:unit             # pure engine/money tests, no DB needed
npm run test:integration      # needs Postgres running
npx vitest run tests/integration/transactions.test.js      # single file
npx vitest run -t "rejects a sell"                         # by test name
```

There is no linter or build step.

## Architecture

- `src/index.js` starts the server + price job and handles graceful shutdown; `src/app.js` builds the Express app (imported directly by tests via supertest). `src/config.js` validates env with zod at import time and exits on bad config.
- Layers: `routes/` (parse input with zod schemas from `schemas/`, call a service) → `services/` → Prisma. Express 5 forwards async throws, so routes don't try/catch; `middleware/errorHandler.js` maps `ZodError`→400, `HttpError` (`lib/errors.js`)→its status, `InsufficientHoldingsError`→422, Prisma P2025→404. Throw these rather than writing responses from services.
- **Portfolio engine** (`services/portfolio.engine.js`) is pure (no DB/Express): replays transactions chronologically (date ASC, id ASC; unsaved `id: null` sorts last), tracking every value as a `{ USD, TZS }` pair converted with each transaction's own `usdTzsRate`. Supports `AVERAGE` and `FIFO`. `portfolio.service.js` just loads transactions/latest snapshot/settings and calls it.
- **Ledger integrity**: every transaction create/update/delete goes through `withLedgerCheck` in `transactions.service.js` — takes a Postgres advisory lock inside a DB transaction, replays the full ledger with the proposed change, and only writes if no sell ever exceeds holdings. New mutations must use it too. Network lookups (FX auto-fill) happen *before* the lock.
- **Prices**: `services/prices/price.service.js` tries providers in order (`providers/*.js`, each `{ name, fetch() }` returning a `D`, using `lib/http.js` `fetchJson` for timeout/retry and `providers/parse.js` zod helpers to validate the body). Snapshots store `btcUsd` + `usdTzs`; BTC/TZS is always derived. `fxRate.service.js` resolves a USD/TZS rate for a given date (latest snapshot or dated currency-api lookup). `jobs/price.job.js` runs on node-cron and never throws. Both services keep in-memory caches with `reset*` functions for tests.
- Settings are a key/value `Setting` table accessed through `settings.service.js`.
- **Daily prices / history**: `DailyPrice` = one row per calendar day in `APP_TIMEZONE` (days are `"YYYY-MM-DD"` strings, helpers in `lib/days.js`). `services/prices/dailyPrice.service.js` has the backfill (`npm run prices:backfill`, CLI in `src/scripts/`) and the nightly rollup (`jobs/dailyPrice.job.js`). The engine's `computeHistory`/`computeMonthly`/`downsampleHistory` share `replay` and `valuePosition` with `computePortfolio`; the last history point must equal the summary.

## Money rules (strict)

- Never use JS floats for money or BTC. Fiat/rates use `D` from `lib/money.js` (a decimal.js clone, precision 50, ROUND_HALF_UP); convert with `toDec` (it rejects non-integer numbers and converts `Prisma.Decimal`). BTC amounts are integer sats as `BigInt` (`btcToSats`/`satsToBtc`).
- Every number in API output is a string: use `formatFiat` (2 dp), `formatPct` (2 dp), `formatRate` (4 dp), `satsToBtc` (8 dp), and `serializeTransaction` for transactions. `lib/bigint.js` makes BigInt JSON-serialisable as a string. Round only when formatting.
- BUY/TRANSFER_IN cost = `fiatAmount + feeAmount`; SELL proceeds = `fiatAmount − feeAmount`.

## Tests

- `vitest.config.js` defines two projects: `unit` (`tests/unit`) and `integration` (`tests/integration`, run serially against one shared DB).
- Integration env comes from `server/.env.test` (+ gitignored `.env.test.local` overrides). The DB name **must end in `_test`** or the run aborts; `globalSetup` runs `prisma migrate deploy` on it.
- Use `setupApi()` from `tests/helpers/api.js`: truncates all tables and creates a fresh user + token before each test, and returns `get/post/patch/del` authed helpers plus `anon()`.
- Real network is blocked: `tests/helpers/noNetwork.js` stubs `fetch` to throw each test and shortens HTTP timeouts/backoff. Mock providers with `routeFetch` / `allProviders` from `tests/helpers/fetchMock.js` (contains captured real response bodies).
- `ENABLE_PRICE_JOB` must be `false` when `NODE_ENV=test` (config enforces it).
- `tests/fixtures/workedExample.js` holds the README's worked P/L example used by engine and API tests.
