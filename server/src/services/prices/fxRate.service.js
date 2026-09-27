// USD/TZS for a transaction date, used to auto-fill usdTzsRate.

import { toDec } from '../../lib/money.js';
import { fetchUsdTzsForDate } from './providers/currencyApi.js';
import { findLatestSnapshot } from './price.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// If the exact day has no published file, try up to this many earlier days.
const LOOKBACK_DAYS = 3;

const historicalCache = new Map(); // requested "YYYY-MM-DD" -> { rate: D, day }

export function resetFxHistoryCache() {
  historicalCache.clear();
}

const isoDay = (date) => date.toISOString().slice(0, 10);

async function historicalUsdTzs(date) {
  const requested = isoDay(date);
  if (historicalCache.has(requested)) return historicalCache.get(requested);

  for (let back = 0; back <= LOOKBACK_DAYS; back++) {
    const day = isoDay(new Date(date.getTime() - back * DAY_MS));
    try {
      const found = { rate: (await fetchUsdTzsForDate(day)).toDecimalPlaces(4), day };
      historicalCache.set(requested, found);
      return found;
    } catch (err) {
      if (err.status === 404) continue; // not published for that day
      console.warn(`[prices] Historical USD/TZS lookup for ${day} failed: ${err.message}`);
      return null;
    }
  }
  console.warn(`[prices] No historical USD/TZS published for ${requested} or the ${LOOKBACK_DAYS} days before`);
  return null;
}

/**
 * Returns { rate: D, source, asOf } or null when no rate can be found.
 * - date within the last 24h and a snapshot from the last 24h exists -> "latest_snapshot"
 * - otherwise the published daily rate for that UTC day -> "historical_lookup"
 */
export async function resolveUsdTzsForDate(date, now = new Date()) {
  if (now - date <= DAY_MS) {
    const snapshot = await findLatestSnapshot();
    if (snapshot && now - snapshot.timestamp <= DAY_MS) {
      return {
        rate: toDec(snapshot.usdTzs),
        source: 'latest_snapshot',
        asOf: snapshot.timestamp.toISOString(),
      };
    }
  }
  const found = await historicalUsdTzs(date);
  return found && { rate: found.rate, source: 'historical_lookup', asOf: found.day };
}
