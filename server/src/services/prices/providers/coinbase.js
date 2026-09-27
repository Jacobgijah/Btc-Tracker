import { z } from 'zod';
import { fetchJson } from '../../../lib/http.js';
import { parseResponse, decimalString } from './parse.js';

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
