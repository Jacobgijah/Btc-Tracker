import { z } from 'zod';
import { fetchJson } from '../../../lib/http.js';
import { parseResponse, decimalString } from './parse.js';

// Verified 2026-09-27: {"error":[],"result":{"XXBTZUSD":{"c":["84720.60000","0.00007316"],...}}}
// "c" is the last trade [price, lot volume]. The result key is Kraken's
// canonical pair name (XXBTZUSD), so read whichever single pair came back.
export const ENDPOINT = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';

const schema = z.object({
  error: z.array(z.string()).max(0, 'Kraken returned errors'),
  result: z
    .record(z.object({ c: z.tuple([decimalString, z.string()]) }))
    .refine((r) => Object.keys(r).length === 1, 'expected exactly one pair'),
});

export default {
  name: 'kraken',
  async fetch() {
    const body = await fetchJson(ENDPOINT);
    if (Array.isArray(body?.error) && body.error.length) {
      throw new Error(`Kraken error: ${body.error.join(', ')}`);
    }
    const [ticker] = Object.values(parseResponse(schema, body).result);
    return ticker.c[0];
  },
};

// Daily OHLC. Verified 2026-09-28:
//   .../OHLC?pair=XBTUSD&interval=1440&since=1790208000
//   -> {"error":[],"result":{"XXBTZUSD":[[1790208000,"84384.5","84914.8","82832.3","84380.0","84060.4","3362.85864323",139286],...],"last":1790380800}}
//   = [time (UTC day start), open, high, low, close, vwap, volume, count]; the last row is today's, still open.
// Only the most recent 720 days are ever returned, whatever `since` says, so this is
// a fallback for recent days only.
export const OHLC_ENDPOINT = 'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440';
export const OHLC_HISTORY_DAYS = 720;

const ohlcSchema = z.object({
  error: z.array(z.string()).max(0, 'Kraken returned errors'),
  result: z
    .object({ last: z.number() })
    .catchall(
      z.array(
        z.tuple([
          z.number().int(),
          z.string(),
          z.string(),
          z.string(),
          decimalString,
          z.string(),
          z.string(),
          z.number(),
        ]),
      ),
    ),
});

/** BTC/USD daily closes (UTC days) for roughly the last 720 days, as Map<"YYYY-MM-DD", D>. */
export async function fetchDailyCloses(httpOptions = {}) {
  const body = await fetchJson(OHLC_ENDPOINT, httpOptions);
  if (Array.isArray(body?.error) && body.error.length) {
    throw new Error(`Kraken error: ${body.error.join(', ')}`);
  }
  const { last, ...pairs } = parseResponse(ohlcSchema, body).result;
  const rows = Object.values(pairs);
  if (rows.length !== 1) throw new Error('unexpected response shape: expected exactly one pair');
  const closes = new Map();
  for (const [time, , , , close] of rows[0]) {
    closes.set(new Date(time * 1000).toISOString().slice(0, 10), close);
  }
  return closes;
}
