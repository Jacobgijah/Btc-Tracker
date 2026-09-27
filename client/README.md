# BTC Tracker — client

Mobile-first React app for the API in `../server`. Vite + React 19 + TypeScript, React Router,
TanStack Query, Tailwind CSS 4, react-hook-form + zod, decimal.js, lucide-react.

```bash
npm install
npm run dev          # http://localhost:5173 (needs the API on :4000; /api is proxied to it)
npm test             # lint:colors, then Vitest + React Testing Library (API mocked)
npm run lint         # oxlint, warnings fail
npm run lint:colors  # fails on any colour outside the brand tokens (see Theme)
npm run build        # type-check + production build into dist/
```

`VITE_API_URL` (see `.env.example`) sets the API base URL for production builds; it defaults to `/api`.

## Pages

| Route | What's there |
| --- | --- |
| `/login` | Email + password. Shows the server's message (e.g. rate-limited login). |
| `/` | Current value + unrealized P/L, stat cards, BTC price card with refresh, last 5 transactions. Empty state for a new ledger; "—" plus an explanation when there's no price yet. |
| `/charts` | Every chart full size: FX split card (TZS only), value vs cost basis, BTC price vs average cost with buy ▲ / sell ▼ markers, holdings over time (BTC or sats), monthly savings. Each has its own 1M/3M/6M/1Y/ALL range. The dashboard shows the FX card and the first two charts in compact form. |
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
- Query keys live in `src/lib/queries.ts`; every ledger change invalidates `transactions` and `portfolio`
  (history, monthly and ledger keys sit under `portfolio`, so charts refresh too).
- `src/features/charts/` — Recharts, loaded as a separate chunk (`React.lazy`). API decimal strings are
  turned into numbers only for chart geometry (`plot()` in `chartUtils.ts`); every value shown in a
  tooltip or label is formatted from the original string. Axis ticks use the compact formatters in
  `format.ts` (`TSh 3.6M`, `$1.2K`, `1.2M sats`); tick count follows the chart width, and the first and
  last x labels are anchored inwards so nothing is clipped at 375px.
- Chart colours come from `CHART` in `chartUtils.ts` (built on `src/theme/tokens.ts`): gold = your money
  (value, average cost, buys, holdings, invested), blue = the market (BTC price, sells, sats), cool-gray =
  cost basis (dashed) and chrome. Series that share a hue also differ by form (▲ vs ▼, dashed, bars vs
  line). The monthly chart puts sats in a second aligned panel rather than a second y-axis.

## Notes

- Dates are entered in local time and sent as ISO UTC. The FX lookup and list filters use the UTC day,
  like the server.
- While the date has just changed, saving is blocked until the rate for the new day has been looked
  up, so a previous day's rate is never saved by accident. A rate you type yourself is never overwritten.

## Theme

Dark only, six brand colours and nothing else. `src/theme/tokens.css` defines them in Tailwind 4's `@theme`
after `--color-*: initial`, so default palette classes (`bg-red-500`, `text-slate-600`, ...) don't exist.
`src/theme/tokens.ts` repeats the six hex values for SVG charts; `tokens.test.ts` keeps the two identical.

| Token | Hex | Aliases (use these in components) |
| --- | --- | --- |
| black-space | `#131313` | `bg`, `on-accent` (text on gold) |
| black-space-soft | `#1a1a1a` | `surface` (cards, inputs, nav, dialogs, tooltips) |
| white | `#e9e8e8` | `text` |
| cool-gray | `#7e8893` | `text-muted`, `border-strong` (inputs, outline buttons); `border`, `hover`, `pressed`, `skeleton` are low-opacity mixes |
| gold | `#d4af35` | `accent` (primary actions, focus, selected), `gain`, `warning` |
| blue | `#4a7abd` | `info` (links, info icons), `loss`, `error` |

Contrast (WCAG): white on bg 15.19:1, on surface 14.23:1; gold 8.83 / 8.27; cool-gray 5.16 / 4.83;
black-space on gold 8.83; **blue only 4.26 / 3.99**, so blue is never used for normal-size text: it goes on
icons, borders, underlines, chart marks and focus/badge outlines, and as text only at ≥ 24px.

- **P/L** (`Pnl` in `components/ui.tsx`, used everywhere): gain = gold text + "+" + ▲; loss = "−" + blue ▼,
  with the number itself blue only for the headline (`size="lg"`, 24px) and white elsewhere; zero or "—" =
  cool-gray.
- **Errors** are a blue border/ring + ⊗ icon + white text; **warnings** a gold border + ⚠ icon.
- **Links** are white text with a blue underline.
- `npm run lint:colors` (also run by `npm test`) fails on colour literals or `rgb()`/`hsl()` outside the token
  files, default Tailwind palette classes, raw token or `white`/`black` classes where an alias exists, and
  `dark:` variants.