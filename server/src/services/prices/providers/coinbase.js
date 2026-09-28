import { z } from 'zod';
import { fetchJson } from '../../../lib/http.js';
import { parseResponse, decimalString, jsonNumber } from './parse.js';
import { addDays } from '../../../lib/days.js';

// Verified 2026-09-27: {"data":{"amount":"84736.785","base":"BTC","currency":"USD"}}
export const ENDPOINT = 'https://api.coinbase.com/v2/prices/BTC-USD/spot';

const schema = z.object({
  data: z.object({
    amount: decimalString,
    base: z.literal('BTC'),
    currency: z.literal('USD'),
  }),
});

export default {
  name: 'coinbase',
  async fetch() {
    return parseResponse(schema, await fetchJson(ENDPOINT)).data.amount;
  },
};

// Daily candles from Coinbase Exchange (public, no key). Verified 2026-09-28:
//   .../candles?granularity=86400&start=2026-09-20T00:00:00Z&end=2026-09-22T00:00:00Z
//   -> [[1790035200,85059.28,86734,86594.94,86198.05,8943.87588877], ...]
//   = [time (UTC day start), low, high, open, close, volume], newest first, JSON numbers.
// start and end are inclusive; more than 300 buckets per request is a 400
// ("Count of aggregations requested exceeds 300"). History starts 2015-07-20.
export const CANDLES_ENDPOINT = 'https://api.exchange.coinbase.com/products/BTC-USD/candles';
export const MAX_CANDLES_PER_REQUEST = 300;

const candlesSchema = z.array(
  z.tuple([z.number().int(), z.number(), z.number(), z.number(), jsonNumber, z.number()]),
);

export const candlesUrl = (fromDay, toDay) =>
  `${CANDLES_ENDPOINT}?granularity=86400&start=${fromDay}T00:00:00Z&end=${toDay}T00:00:00Z`;

/**
 * BTC/USD daily closes (UTC days) from `fromDay` to `toDay` inclusive, as
 * Map<"YYYY-MM-DD", D>, paging 300 days per request. Days Coinbase has no
 * candle for are simply absent. `beforeRequest` runs before every request
 * after the first (for throttling).
 */
export async function fetchDailyCloses(fromDay, toDay, { beforeRequest = async () => {}, ...httpOptions } = {}) {
  const closes = new Map();
  let start = fromDay;
  while (start <= toDay) {
    const endCandidate = addDays(start, MAX_CANDLES_PER_REQUEST - 1);
    const end = endCandidate < toDay ? endCandidate : toDay;
    if (start !== fromDay) await beforeRequest();
    const candles = parseResponse(candlesSchema, await fetchJson(candlesUrl(start, end), httpOptions));
    for (const [time, , , , close] of candles) {
      const day = new Date(time * 1000).toISOString().slice(0, 10);
      if (day >= start && day <= end) closes.set(day, close);
    }
    start = addDays(end, 1);
  }
  return closes;
}
