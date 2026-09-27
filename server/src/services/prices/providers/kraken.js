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
