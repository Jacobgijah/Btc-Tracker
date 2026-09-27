# BTC Tracker

Personal Bitcoin savings tracker. Single user, buys in TZS and USD, P/L shown in both.

- `server/` — Node.js + Express 5 + Prisma + PostgreSQL API
- `client/` — React + TypeScript web app (Vite, TanStack Query, Tailwind). See [client/README.md](client/README.md).

## Setup

```bash
docker compose up -d                 # Postgres 16 (set POSTGRES_PORT in a root .env if 5432 is taken)
npm run install:all                  # root (concurrently), server and client dependencies
cd server
cp .env.example .env                 # fill in JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npx prisma migrate dev               # create tables
npm run db:seed                      # create your user + default settings
cd ..
npm run dev                          # server + client together
```

`npm run dev` at the repo root runs both with [concurrently](https://github.com/open-cli-tools/concurrently)
(Ctrl+C stops both):

- API: http://localhost:4000 (also starts the price job)
- App: http://localhost:5173 — sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `server/.env`

In development the Vite dev server proxies `/api/*` to `http://localhost:4000/*` (the `/api` prefix is
stripped), so the browser only talks to one origin and CORS never comes into play. To run just one side,
use `npm run dev` inside `server/` or `client/`.

### Root scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Server (nodemon) + client (Vite) together |
| `npm test` | Server tests (unit + integration, needs Postgres) then client tests |
| `npm run build` | Production build of the client into `client/dist` |
| `npm run lint` | Lint the client (oxlint) |
| `npm run install:all` | Install dependencies in root, `server/` and `client/` |

### Production

Build the client with `VITE_API_URL` set to the API's public URL (e.g.
`VITE_API_URL=https://btc-api.example.com npm run build`) and serve `client/dist` as static files with
a fallback to `index.html` for client-side routes. Set the server's `CLIENT_ORIGIN` to the client's
origin so CORS allows it. Without `VITE_API_URL` the client calls `/api`, which works if a reverse
proxy forwards `/api/*` to the server with the prefix stripped.

## Tests

```bash
# in server/
npm test              # unit + integration
npm run test:unit     # pure P/L engine only, no database needed
npm run test:watch

# in client/
npm test              # Vitest + React Testing Library, API mocked (no server needed)
```

Integration tests use a separate database (`btc_tracker_test`) configured in `server/.env.test`;
put machine-specific overrides (e.g. another port) in `server/.env.test.local`. Before each run
pending migrations are applied with `prisma migrate deploy`, and every test truncates the tables
first. The runner refuses to start unless the database name ends in `_test`, so it cannot touch
the dev database.

## Money rules

- No JS floats for money or BTC: fiat uses `decimal.js`, BTC amounts are integer sats (`BigInt`).
- Every number in API responses is a **string**. Fiat is rounded to 2 dp, percentages to 2 dp,
  FX rates to 4 dp, BTC to 8 dp, all ROUND_HALF_UP. Internal maths keeps full precision.
- Each transaction stores `usdTzsRate` (TZS per 1 USD on the trade date), so every value exists
  in both currencies: TZS cost = USD cost × rate, and vice versa.
- Cost of a BUY / TRANSFER_IN = `fiatAmount + feeAmount`. Net proceeds of a SELL = `fiatAmount − feeAmount`.
- Cost methods: `AVERAGE` (weighted average cost) or `FIFO` (oldest lots sold first).
- Transactions are processed by `date` ASC, then `id` ASC.

## Prices

A background job fetches two rates and saves them together as one `PriceSnapshot`:
`btcUsd` (BTC price in USD) and `usdTzs` (TZS per 1 USD). BTC/TZS is always derived as
`btcUsd × usdTzs`, never fetched. The job runs once at startup and then on `PRICE_REFRESH_CRON`
(every 15 minutes by default). A run is skipped if the previous one is still going, and failures
are logged, never crash the server.

Providers, tried in order until one answers:

| Rate | Provider | Endpoint |
| --- | --- | --- |
| BTC/USD | CoinGecko | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd` (optional `COINGECKO_API_KEY` sent as `x-cg-demo-api-key`) |
| BTC/USD | Coinbase | `https://api.coinbase.com/v2/prices/BTC-USD/spot` |
| BTC/USD | Kraken | `https://api.kraken.com/0/public/Ticker?pair=XBTUSD` (last trade price) |
| USD/TZS | open.er-api | `https://open.er-api.com/v6/latest/USD` |
| USD/TZS | currency-api (fawazahmed0, via jsDelivr) | `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json` |
| USD/TZS on a date | currency-api | `…/currency-api@YYYY-MM-DD/v1/currencies/usd.json` (from March 2024) |

- Every request has a 10 s timeout, is retried twice with backoff (5xx, 429, timeouts and network
  errors only), sends a descriptive User-Agent, and has its response validated with zod.
- USD/TZS is cached in memory for `FX_CACHE_HOURS`. If every FX provider fails, the previous
  snapshot's `usdTzs` is reused (logged as a warning). If every BTC provider fails, nothing is saved.
- Sanity check: a value that moved more than 50% from the previous snapshot is rejected, logged
  as an error, and nothing is saved.
- Stored values are rounded ROUND_HALF_UP to the column precision: `btcUsd` 2 dp, `usdTzs` 4 dp.

### Price environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `COINGECKO_API_KEY` | (none) | Optional CoinGecko demo API key |
| `PRICE_REFRESH_CRON` | `*/15 * * * *` | Refresh schedule (node-cron syntax) |
| `FX_CACHE_HOURS` | `6` | How long to reuse a fetched USD/TZS rate |
| `PRICE_STALE_MINUTES` | `60` | Prices older than this are flagged `stale: true` |
| `ENABLE_PRICE_JOB` | `true` (`false` when `NODE_ENV=test`) | Run the scheduled job. Must be `false` in tests. |

### Example: latest price and refresh

```http
GET /prices/latest
```

```json
{ "btcUsd": "84719.00", "usdTzs": "2656.3489", "btcTzs": "225043222.46", "timestamp": "2026-09-27T19:06:13.829Z", "stale": false }
```

`POST /prices/refresh` returns the same fields plus `id` and
`"sources": { "btcUsd": "coingecko", "usdTzs": "open.er-api (cached)" }`.

### Example: history

`GET /prices/history?from=2026-09-01&to=2026-09-02&interval=hourly` returns the last snapshot in
each UTC hour (or day for `daily`; every snapshot for `raw`), oldest first:

```json
{
  "interval": "hourly",
  "from": "2026-09-01T00:00:00.000Z",
  "to": "2026-09-02T23:59:59.999Z",
  "count": 2,
  "truncated": false,
  "points": [
    { "bucket": "2026-09-01T10:00:00.000Z", "btcUsd": "80100.00", "usdTzs": "2600.0000", "btcTzs": "208260000.00", "timestamp": "2026-09-01T10:40:00.000Z" },
    { "bucket": "2026-09-01T11:00:00.000Z", "btcUsd": "80300.00", "usdTzs": "2602.0000", "btcTzs": "208940600.00", "timestamp": "2026-09-01T11:50:00.000Z" }
  ]
}
```

At most 1000 points are returned (the most recent ones); `truncated` says whether more existed.

### Example: FX for a date

```http
GET /prices/fx?date=2026-01-10
```

```json
{ "date": "2026-01-10", "usdTzs": "2498.6251", "source": "historical_lookup", "asOf": "2026-01-10" }
```

## API

All routes except `/health` and `/auth/login` need `Authorization: Bearer <token>`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok" }` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` (10 attempts / 15 min / IP) |
| GET | `/auth/me` | Current user |
| GET | `/transactions` | List. Query: `type`, `from`, `to`, `page` (1), `pageSize` (50, max 200). Newest first. |
| GET | `/transactions/:id` | One transaction |
| POST | `/transactions` | Create |
| PATCH | `/transactions/:id` | Partial update |
| DELETE | `/transactions/:id` | Delete (204) |
| GET | `/portfolio/summary` | Holdings, cost basis and P/L in USD and TZS |
| GET | `/portfolio/ledger` | Every transaction, oldest first, with running totals after it |
| GET | `/prices/latest` | Latest price snapshot with a `stale` flag (404 before the first one) |
| POST | `/prices/refresh` | Fetch prices now and save a snapshot (1 request / minute) |
| GET | `/prices/history` | Query: `from`, `to`, `interval` = `raw` \| `hourly` \| `daily`. Max 1000 points. |
| GET | `/prices/fx` | Query: `date=YYYY-MM-DD`. USD/TZS for that day, to pre-fill `usdTzsRate`. |
| GET | `/settings` | `{ displayCurrency, costMethod }` |
| PATCH | `/settings` | `displayCurrency`: `TZS`\|`USD`, `costMethod`: `AVERAGE`\|`FIFO` |

### Transaction fields

| Field | Rules |
| --- | --- |
| `type` | `BUY`, `SELL` or `TRANSFER_IN` (BTC received, not bought) |
| `sats` **or** `btc` | Exactly one. `sats`: positive integer (number or string). `btc`: decimal string, ≤ 8 dp. Stored as sats. |
| `fiatAmount` | Excluding fee. > 0 for BUY/SELL, ≥ 0 for TRANSFER_IN (its market value; 0 = zero cost basis). ≤ 2 dp. |
| `feeAmount` | ≥ 0, default 0, ≤ 2 dp, in `fiatCurrency`. For a SELL it must be less than `fiatAmount`. |
| `fiatCurrency` | `TZS` or `USD` |
| `usdTzsRate` | TZS per 1 USD on the trade date. > 0, ≤ 4 dp. **Optional on create** (see below). |
| `date` | ISO datetime (`2026-01-10T14:30:00Z`) or date (`2026-01-10`, = 00:00 UTC). Not in the future. |
| `exchange`, `note` | Optional, ≤ 100 / ≤ 500 chars. `null` clears them on PATCH. |

`to` in the list filter: a plain date includes that whole day (UTC).

### Errors

| Status | When | Body |
| --- | --- | --- |
| 400 | Validation failed | `{ error, fieldErrors: { field: [msg] }, formErrors }` |
| 401 | Missing / invalid token | `{ error }` |
| 404 | Unknown id or route; no price snapshot yet; no FX rate for a date | `{ error }` |
| 422 | The change would make a sell exceed holdings at its point in time | `{ error, details: { transactionId, date, attemptedSats, availableSats } }` |
| 422 | `usdTzsRate` omitted and no rate could be found for the date | `{ error, details: { field: "usdTzsRate", date } }` |
| 429 | Too many login attempts / price refreshes | `{ error }` |
| 502 | `POST /prices/refresh`: every provider failed, or a value failed the sanity check | `{ error, details }` |

Every create, update and delete replays the whole ledger with the change applied **before**
writing, so deleting an old buy or backdating a sell can't leave you with negative holdings.
`transactionId` is `null` when the offending sell is the one being created.

### Example: create a transaction

```http
POST /transactions
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json

{
  "type": "BUY",
  "date": "2026-01-10",
  "btc": "0.01",
  "fiatAmount": "2500000",
  "feeAmount": "25000",
  "fiatCurrency": "TZS",
  "usdTzsRate": "2500",
  "exchange": "Binance"
}
```

```json
201 Created
{
  "id": 1,
  "type": "BUY",
  "date": "2026-01-10T00:00:00.000Z",
  "sats": "1000000",
  "btc": "0.01000000",
  "fiatAmount": "2500000.00",
  "feeAmount": "25000.00",
  "fiatCurrency": "TZS",
  "usdTzsRate": "2500.0000",
  "exchange": "Binance",
  "note": null,
  "createdAt": "2026-09-27T18:40:00.000Z",
  "updatedAt": "2026-09-27T18:40:00.000Z",
  "usdTzsRateSource": "provided"
}
```

### Automatic `usdTzsRate`

`usdTzsRate` can be left out of `POST /transactions`. The server fills it in before saving and
returns where it came from in `usdTzsRateSource` (on the POST response only; it isn't stored):

| `usdTzsRateSource` | When |
| --- | --- |
| `provided` | You sent `usdTzsRate`. Your rate always wins. |
| `latest_snapshot` | Transaction dated within the last 24h, and a price snapshot from the last 24h exists. |
| `historical_lookup` | Otherwise: the published daily rate for that UTC day from currency-api (cached in memory). If that day isn't published, up to 3 earlier days are tried. |

If no rate is found (e.g. dates before March 2024, which the historical source doesn't cover),
the request fails with **422** and you need to enter `usdTzsRate` yourself. `GET /prices/fx?date=`
runs the same lookup, so a form can pre-fill the field.

### Example: portfolio summary

After buying 1,000,000 sats for 2,500,000 TZS (+25,000 fee, rate 2500), 500,000 sats for 600 USD
(+6 fee, rate 2600), selling 300,000 sats for 330 USD (−3 fee, rate 2650), with a latest price of
BTC = 110,000 USD and 1 USD = 2,700 TZS:

```http
GET /portfolio/summary
Authorization: Bearer eyJhbGciOi...
```

```json
{
  "costMethod": "AVERAGE",
  "transactionCount": 3,
  "holdings": { "sats": "1200000", "btc": "0.01200000" },
  "price": { "btcUsd": "110000.00", "usdTzs": "2700.0000", "btcTzs": "297000000.00", "timestamp": "2026-04-02T00:00:00.000Z", "stale": true },
  "USD": {
    "invested": "1616.00",
    "costBasis": "1292.80",
    "avgCostPerBtc": "107733.33",
    "realizedPnl": "3.80",
    "currentValue": "1320.00",
    "unrealizedPnl": "27.20",
    "unrealizedPnlPct": "2.10",
    "totalPnl": "31.00"
  },
  "TZS": {
    "invested": "4100600.00",
    "costBasis": "3280480.00",
    "avgCostPerBtc": "273373333.33",
    "realizedPnl": "46430.00",
    "currentValue": "3564000.00",
    "unrealizedPnl": "283520.00",
    "unrealizedPnlPct": "8.64",
    "totalPnl": "329950.00"
  }
}
```

- `invested`: gross cost of every BUY and TRANSFER_IN ever.
- `costBasis`: cost of the coins you still hold.
- `avgCostPerBtc` is `null` when holdings are 0.
- `unrealizedPnlPct` is `null` when `costBasis` is 0.
- Until a price snapshot exists, `price`, `currentValue`, `unrealizedPnl`, `unrealizedPnlPct` and `totalPnl` are `null`.
- `price.stale` is `true` when the latest snapshot is older than `PRICE_STALE_MINUTES`.

With `costMethod: "FIFO"` the same trades give realized 109,050 TZS / 24.00 USD and unrealized
220,900 TZS / 7.00 USD. The total P/L is the same under both methods.

### Ledger rows

`GET /portfolio/ledger` returns each transaction (same fields as above) plus the running position after it:

```json
{
  "id": 3, "type": "SELL", "date": "2026-03-10T00:00:00.000Z", "sats": "300000", "...": "...",
  "holdingsSats": "1200000",
  "holdingsBtc": "0.01200000",
  "USD": { "cost": null, "proceeds": "327.00", "costBasis": "1292.80", "avgCostPerBtc": "107733.33", "costOfSold": "323.20", "realizedPnl": "3.80" },
  "TZS": { "cost": null, "proceeds": "866550.00", "costBasis": "3280480.00", "avgCostPerBtc": "273373333.33", "costOfSold": "820120.00", "realizedPnl": "46430.00" }
}
```
