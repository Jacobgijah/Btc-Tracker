import { z } from 'zod';
import { fetchJson } from '../../../lib/http.js';
import { parseResponse, jsonNumber } from './parse.js';

// Verified 2026-09-27: {"result":"success","base_code":"USD","rates":{...,"TZS":2656.348863,...}}
// Free, no key; rates update once a day.
export const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

const schema = z.object({
  result: z.literal('success'),
  base_code: z.literal('USD'),
  rates: z.object({ TZS: jsonNumber }),
});

export default {
  name: 'open.er-api',
  async fetch() {
    return parseResponse(schema, await fetchJson(ENDPOINT)).rates.TZS;
  },
};
