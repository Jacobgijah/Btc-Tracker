# BTC Tracker — client

Mobile-first React app for the API in `../server`. Vite + React 19 + TypeScript, React Router,
TanStack Query, Tailwind CSS 4, react-hook-form + zod, decimal.js, lucide-react.

```bash
npm install
npm run dev          # http://localhost:5173 (needs the API on :4000; /api is proxied to it)
npm test             # Vitest + React Testing Library (API mocked)
npm run lint         # oxlint, warnings fail
npm run build        # type-check + production build into dist/
```

`VITE_API_URL` (see `.env.example`) sets the API base URL for production builds; it defaults to `/api`.

## Pages

| Route | What's there |
| --- | --- |
| `/login` | Email + password. Shows the server's message (e.g. rate-limited login). |
| `/` | Current value + unrealized P/L, stat cards, BTC price card with refresh, last 5 transactions. Empty state for a new ledger; "—" plus an explanation when there's no price yet. |
| `/transactions` | Type / date filters and pagination (in the URL). Table on desktop, cards on mobile. Edit and delete (with confirmation; a refused delete explains which later sell it would break). |
| `/transactions/new`, `/transactions/:id/edit` | Form with live preview. USD/TZS rate is pre-filled from `GET /prices/fx` for the chosen date and stays editable. Sells show current holdings. |
| `/settings` | Cost method (AVERAGE / FIFO), display currency, signed-in email, log out. |

The TZS | USD toggle in the top bar saves `displayCurrency` to the server and applies everywhere.

## How it's put together

- `src/lib/api.ts` — the only place that calls `fetch`. Adds the Bearer token (kept in `localStorage`),
  turns error bodies into `ApiError` (carrying the server's `error`, `fieldErrors` and `details`), and on
  any 401 clears the token; `RequireAuth` then redirects to `/login?next=<page>` and login returns there.
- `src/lib/format.ts` — every number shown on screen goes through here (`TSh 1,234,567`, `$1,234.56`,
  `0.01200000 BTC`, `1,200,000 sats`, `+8.64%` / `−2.10%`, `—` for null). Rounding uses decimal.js.
- `src/lib/money.ts` / `calc.ts` — decimal.js and BigInt helpers. **Money and BTC are never JS floats**;
  API strings go into `Decimal` or `BigInt` sats, and only formatting turns them into text.
- `src/features/transactions/transactionSchema.ts` — the form's zod schema, mirroring the server's
  rules (≤ 8 dp BTC / whole sats, ≤ 2 dp fiat, ≤ 4 dp rate, fee < amount on a sell, no future dates,
  text lengths). The server is still the authority: its 400 field errors and 422s are mapped back
  onto the form.
- Query keys live in `src/lib/queries.ts`; every ledger change invalidates `transactions` and `portfolio`.

## Notes

- Dates are entered in local time and sent as ISO UTC. The FX lookup and list filters use the UTC day,
  like the server.
- While the date has just changed, saving is blocked until the rate for the new day has been looked
  up, so a previous day's rate is never saved by accident. A rate you type yourself is never overwritten.
- Light/dark follows the system setting. Bitcoin orange is used only for accents; primary buttons use
  near-black text on it for contrast.
