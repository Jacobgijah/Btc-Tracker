# BTC Tracker

Personal Bitcoin savings tracker. Single user, buys in TZS and USD, P/L shown in both.

- `server/` — Node.js + Express 5 + Prisma + PostgreSQL API

## Setup

```bash
docker compose up -d                 # Postgres 16 (set POSTGRES_PORT in a root .env if 5432 is taken)
cd server
cp .env.example .env                 # fill in JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx prisma migrate dev               # create tables
npm run db:seed                      # create your user + default settings
npm run dev                          # http://localhost:4000
```

## Tests

```bash
npm test              # unit + integration
npm run test:unit     # pure P/L engine only, no database needed
npm run test:watch
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
| `usdTzsRate` | TZS per 1 USD on the trade date. > 0, ≤ 4 dp. |
| `date` | ISO datetime (`2026-01-10T14:30:00Z`) or date (`2026-01-10`, = 00:00 UTC). Not in the future. |
| `exchange`, `note` | Optional, ≤ 100 / ≤ 500 chars. `null` clears them on PATCH. |

`to` in the list filter: a plain date includes that whole day (UTC).

### Errors

| Status | When | Body |
| --- | --- | --- |
| 400 | Validation failed | `{ error, fieldErrors: { field: [msg] }, formErrors }` |
| 401 | Missing / invalid token | `{ error }` |
| 404 | Unknown id or route | `{ error }` |
| 422 | The change would make a sell exceed holdings at its point in time | `{ error, details: { transactionId, date, attemptedSats, availableSats } }` |

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
  "updatedAt": "2026-09-27T18:40:00.000Z"
}
```

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
  "price": { "btcUsd": "110000.00", "usdTzs": "2700.0000", "btcTzs": "297000000.00", "timestamp": "2026-04-02T00:00:00.000Z" },
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
