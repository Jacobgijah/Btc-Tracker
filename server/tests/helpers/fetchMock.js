import { vi } from 'vitest';

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const status = (code) => () => json({ error: `mock ${code}` }, code);

/** A fetch that never answers; rejects when the caller's AbortController fires. */
export const hang = (url, { signal }) =>
  new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

// Response bodies captured from the real providers on 2026-09-27.
export const BODIES = {
  coingecko: { bitcoin: { usd: 84721 } },
  coinbase: { data: { amount: '84736.785', base: 'BTC', currency: 'USD' } },
  kraken: {
    error: [],
    result: { XXBTZUSD: { a: ['84720.60000', '1', '1.000'], c: ['84720.60000', '0.00007316'] } },
  },
  erApi: { result: 'success', base_code: 'USD', rates: { USD: 1, TZS: 2656.348863 } },
  currencyApi: { date: '2026-09-26', usd: { usd: 1, tzs: 2647.19784399 } },
};

// History endpoints, captured from the real APIs on 2026-09-28.
export const HISTORY_BODIES = {
  // candles?granularity=86400&start=2026-09-20T00:00:00Z&end=2026-09-22T00:00:00Z
  coinbaseCandles: [
    [1790035200, 85059.28, 86734, 86594.94, 86198.05, 8943.87588877],
    [1789948800, 80837.42, 87397, 81160.33, 86594.94, 14077.54012157],
    [1789862400, 80085, 81472.04, 81233.91, 81159.64, 3612.2748174],
  ],
  // OHLC?pair=XBTUSD&interval=1440&since=1790208000
  krakenOhlc: {
    error: [],
    result: {
      XXBTZUSD: [
        [1790208000, '84384.5', '84914.8', '82832.3', '84380.0', '84060.4', '3362.85864323', 139286],
        [1790294400, '84380.0', '85247.4', '83163.6', '84090.5', '84110.3', '3084.16569499', 131352],
      ],
      last: 1790208000,
    },
  },
  // data.jsdelivr.com/v1/packages/npm/@fawazahmed0/currency-api (trimmed)
  jsdelivrMetadata: {
    type: 'npm',
    name: '@fawazahmed0/currency-api',
    tags: { '2024-03-02': '2024.3.2', '2024-03-03': '2024.3.3', latest: '2026.9.27' },
    versions: [{ version: '2026.9.27', links: {} }],
  },
  // currency-api@2026-09-20/v1/currencies/usd.json (trimmed)
  currencyApiDated: { date: '2026-09-20', usd: { usd: 1, tzs: 2643.45091116 } },
};

// URL fragments that identify each provider.
export const MATCH = {
  coingecko: 'api.coingecko.com',
  coinbase: 'api.coinbase.com',
  kraken: 'api.kraken.com',
  erApi: 'open.er-api.com',
  currencyApi: '@fawazahmed0/currency-api@latest/',
  dated: (day) => `@fawazahmed0/currency-api@${day}/`,
  coinbaseCandles: 'api.exchange.coinbase.com/products/BTC-USD/candles',
  krakenOhlc: 'api.kraken.com/0/public/OHLC',
  jsdelivrMetadata: 'data.jsdelivr.com/v1/packages/npm/@fawazahmed0/currency-api',
  anyDated: '@fawazahmed0/currency-api@20',
};

/**
 * Installs a fetch mock. `routes` maps a URL fragment to a response body
 * (object), or to a handler `(url, init) => Response | Promise<Response>`.
 * Any unmatched URL throws, so nothing can reach the real network.
 */
export function routeFetch(routes) {
  const fn = vi.fn(async (url, init) => {
    for (const [fragment, handler] of Object.entries(routes)) {
      if (String(url).includes(fragment)) {
        return typeof handler === 'function' ? handler(url, init) : json(handler);
      }
    }
    throw new Error(`Unexpected network call: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Every live provider answering normally, with per-provider overrides. */
export function allProviders(overrides = {}) {
  const routes = {};
  for (const key of ['coingecko', 'coinbase', 'kraken', 'erApi', 'currencyApi']) {
    routes[MATCH[key]] = key in overrides ? overrides[key] : BODIES[key];
  }
  return routeFetch(routes);
}

export const callsTo = (fetchMock, fragment) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment)).length;
