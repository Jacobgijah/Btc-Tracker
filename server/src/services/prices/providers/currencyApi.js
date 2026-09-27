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
export async function fetchUsdTzsForDate(day, httpOptions = {}) {
  return parseResponse(schema, await fetchJson(urlFor(day), httpOptions)).usd.tzs;
}

// jsDelivr's package metadata has a dist-tag per published day, so the backfill
// can skip unpublished days instead of probing each one for a 404. Verified 2026-09-28:
//   {"type":"npm","name":"@fawazahmed0/currency-api","tags":{"2024-03-02":"2024.3.2",...,"latest":"2026.9.27"},"versions":[...]}
//   938 dated tags, 2024-03-02 .. 2026-09-27; 2025-12-10 and 2026-08-19 were never published.
export const PACKAGE_METADATA_URL = 'https://data.jsdelivr.com/v1/packages/npm/@fawazahmed0/currency-api';

const metadataSchema = z.object({ tags: z.record(z.string()) });

/** Set of "YYYY-MM-DD" days that have a published release. */
export async function fetchPublishedDays(httpOptions = {}) {
  const { tags } = parseResponse(metadataSchema, await fetchJson(PACKAGE_METADATA_URL, httpOptions));
  return new Set(Object.keys(tags).filter((tag) => /^\d{4}-\d{2}-\d{2}$/.test(tag)));
}

export default {
  name: 'currency-api',
  async fetch() {
    return parseResponse(schema, await fetchJson(urlFor('latest'))).usd.tzs;
  },
};
