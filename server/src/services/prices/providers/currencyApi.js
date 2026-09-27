import { z } from 'zod';
import { fetchJson } from '../../../lib/http.js';
import { parseResponse, jsonNumber } from './parse.js';

// fawazahmed0/currency-api via jsDelivr. Verified 2026-09-27:
//   latest: .../currency-api@latest/v1/currencies/usd.json  -> {"date":"2026-09-26","usd":{...,"tzs":2647.19784399}}
//   dated:  .../currency-api@YYYY-MM-DD/v1/currencies/usd.json (2024-03-06 works;
//           2024-03-01 and before return 404 "Couldn't find the requested release version")
const BASE = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';

export const urlFor = (version) => `${BASE}@${version}/v1/currencies/usd.json`;

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usd: z.object({ tzs: jsonNumber }),
});

/** USD/TZS published for a given UTC day ("YYYY-MM-DD"). Throws HttpRequestError(404) if none. */
export async function fetchUsdTzsForDate(day) {
  return parseResponse(schema, await fetchJson(urlFor(day))).usd.tzs;
}

export default {
  name: 'currency-api',
  async fetch() {
    return parseResponse(schema, await fetchJson(urlFor('latest'))).usd.tzs;
  },
};
