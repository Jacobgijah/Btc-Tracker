import { z } from 'zod';
import { config } from '../../../config.js';
import { fetchJson } from '../../../lib/http.js';
import { parseResponse, jsonNumber } from './parse.js';

// Verified 2026-09-27: {"bitcoin":{"usd":84721}}
export const ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

const schema = z.object({ bitcoin: z.object({ usd: jsonNumber }) });

export default {
  name: 'coingecko',
  async fetch() {
    const headers = config.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': config.COINGECKO_API_KEY } : {};
    return parseResponse(schema, await fetchJson(ENDPOINT, { headers })).bitcoin.usd;
  },
};
