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

// URL fragments that identify each provider.
export const MATCH = {
  coingecko: 'api.coingecko.com',
  coinbase: 'api.coinbase.com',
  kraken: 'api.kraken.com',
  erApi: 'open.er-api.com',
  currencyApi: '@fawazahmed0/currency-api@latest/',
  dated: (day) => `@fawazahmed0/currency-api@${day}/`,
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
