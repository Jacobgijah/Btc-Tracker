import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../config.js';
import { D, toDec, formatFiat, formatRate, formatPct } from '../../lib/money.js';
import { HttpError } from '../../lib/errors.js';
import coingecko from './providers/coingecko.js';
import coinbase from './providers/coinbase.js';
import kraken from './providers/kraken.js';
import erApi from './providers/erApi.js';
import currencyApi from './providers/currencyApi.js';

// Fallback order matters: the first provider that answers wins.
export const BTC_USD_PROVIDERS = [coingecko, coinbase, kraken];
export const USD_TZS_PROVIDERS = [erApi, currencyApi];

const MAX_CHANGE_FROM_PREVIOUS = new D('0.5'); // 50%
const MAX_HISTORY_POINTS = 1000;

let fxCache = null; // { value: D, source, fetchedAt: ms }

export function resetPriceCaches() {
  fxCache = null;
}

// ---------------------------------------------------------------------------
// Fetching

async function tryProviders(providers, label) {
  const failures = [];
  for (const provider of providers) {
    try {
      const value = await provider.fetch();
      if (!(value instanceof D) || !value.isFinite() || value.lte(0)) {
        throw new Error(`returned an invalid value: ${value}`);
      }
      return { value, source: provider.name };
    } catch (err) {
      console.warn(`[prices] ${label} provider "${provider.name}" failed: ${err.message}`);
      failures.push({ provider: provider.name, error: err.message });
    }
  }
  throw new HttpError(502, `All ${label} providers failed`, { failures });
}

/** BTC price in USD from the first provider that answers: { value: D, source }. */
export function fetchBtcUsd() {
  return tryProviders(BTC_USD_PROVIDERS, 'BTC/USD');
}

/** TZS per 1 USD, cached in memory for FX_CACHE_HOURS: { value: D, source, cached }. */
export async function fetchUsdTzs() {
  const maxAgeMs = config.FX_CACHE_HOURS * 60 * 60 * 1000;
  if (fxCache && Date.now() - fxCache.fetchedAt < maxAgeMs) {
    return { value: fxCache.value, source: fxCache.source, cached: true };
  }
  const { value, source } = await tryProviders(USD_TZS_PROVIDERS, 'USD/TZS');
  fxCache = { value, source, fetchedAt: Date.now() };
  return { value, source, cached: false };
}

// ---------------------------------------------------------------------------
// Snapshots

export function findLatestSnapshot(db = prisma) {
  return db.priceSnapshot.findFirst({ orderBy: [{ timestamp: 'desc' }, { id: 'desc' }] });
}

export function isStale(timestamp, now = Date.now()) {
  return now - new Date(timestamp).getTime() > config.PRICE_STALE_MINUTES * 60 * 1000;
}

function formatSnapshot(s) {
  const btcUsd = toDec(s.btcUsd);
  const usdTzs = toDec(s.usdTzs);
  return {
    btcUsd: formatFiat(btcUsd),
    usdTzs: formatRate(usdTzs),
    btcTzs: formatFiat(btcUsd.times(usdTzs)),
    timestamp: new Date(s.timestamp).toISOString(),
    stale: isStale(s.timestamp),
  };
}

/** Throws (and logs) if `next` moved more than 50% away from `previous`. */
function checkAgainstPrevious(label, next, previous, source) {
  const prev = toDec(previous);
  const change = next.minus(prev).abs().div(prev);
  if (change.gt(MAX_CHANGE_FROM_PREVIOUS)) {
    const message =
      `Rejected ${label} ${next.toFixed()} from ${source}: ` +
      `${formatPct(change.times(100))}% away from previous ${prev.toFixed()} (limit 50%)`;
    console.error(`[prices] ${message}. Snapshot not saved.`);
    throw new HttpError(502, message, { field: label, value: next.toFixed(), previous: prev.toFixed(), source });
  }
}

/**
 * Fetches BTC/USD and USD/TZS and saves one PriceSnapshot.
 * - Every BTC provider failing: nothing saved (HttpError 502).
 * - Every FX provider failing: the previous snapshot's usdTzs is reused.
 * - A value > 50% away from the previous snapshot: nothing saved (HttpError 502).
 */
export async function refreshPrices() {
  const previous = await findLatestSnapshot();
  const btc = await fetchBtcUsd();

  let fx;
  try {
    fx = await fetchUsdTzs();
  } catch (err) {
    if (!previous) {
      throw new HttpError(502, 'All USD/TZS providers failed and there is no previous rate to reuse', err.details);
    }
    console.warn(`[prices] All USD/TZS providers failed; reusing previous usdTzs ${previous.usdTzs}`);
    fx = { value: toDec(previous.usdTzs), source: 'previous_snapshot', cached: false };
  }

  const btcUsd = btc.value.toDecimalPlaces(2);
  const usdTzs = fx.value.toDecimalPlaces(4);

  if (previous) {
    checkAgainstPrevious('btcUsd', btcUsd, previous.btcUsd, btc.source);
    try {
      checkAgainstPrevious('usdTzs', usdTzs, previous.usdTzs, fx.source);
    } catch (err) {
      resetPriceCaches(); // don't keep serving a rejected rate from the cache
      throw err;
    }
  }

  const snapshot = await prisma.priceSnapshot.create({
    data: { btcUsd: btcUsd.toFixed(2), usdTzs: usdTzs.toFixed(4) },
  });
  const sources = {
    btcUsd: btc.source,
    usdTzs: fx.cached ? `${fx.source} (cached)` : fx.source,
  };
  console.info(
    `[prices] Saved snapshot #${snapshot.id}: BTC/USD ${btcUsd.toFixed(2)} (${sources.btcUsd}), ` +
      `USD/TZS ${usdTzs.toFixed(4)} (${sources.usdTzs})`,
  );
  return { id: snapshot.id, ...formatSnapshot(snapshot), sources };
}

/** Latest snapshot with a `stale` flag, or null if none exists yet. */
export async function getLatestPrice() {
  const snapshot = await findLatestSnapshot();
  return snapshot && formatSnapshot(snapshot);
}

// ---------------------------------------------------------------------------
// History

const BUCKET_UNITS = { hourly: 'hour', daily: 'day' };

/**
 * Snapshots between `from` and `to`, oldest first. hourly/daily return the last
 * snapshot in each UTC bucket. At most 1000 points (the most recent ones).
 */
export async function getPriceHistory({ from, to, interval }) {
  const conditions = [];
  if (from) conditions.push(Prisma.sql`"timestamp" >= ${from}`);
  if (to) conditions.push(Prisma.sql`"timestamp" <= ${to}`);
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  const limit = MAX_HISTORY_POINTS + 1; // one extra to detect truncation

  let rows;
  if (interval === 'raw') {
    rows = await prisma.$queryRaw`
      SELECT id, "timestamp", "btcUsd", "usdTzs", NULL::timestamp AS bucket
      FROM "PriceSnapshot" ${where}
      ORDER BY "timestamp" DESC, id DESC
      LIMIT ${limit}`;
  } else {
    // Whitelisted literal, so safe to inline.
    const unit = Prisma.raw(`'${BUCKET_UNITS[interval]}'`);
    rows = await prisma.$queryRaw`
      SELECT id, "timestamp", "btcUsd", "usdTzs", bucket FROM (
        SELECT DISTINCT ON (date_trunc(${unit}, "timestamp"))
          id, "timestamp", "btcUsd", "usdTzs", date_trunc(${unit}, "timestamp") AS bucket
        FROM "PriceSnapshot" ${where}
        ORDER BY date_trunc(${unit}, "timestamp"), "timestamp" DESC, id DESC
      ) AS last_in_bucket
      ORDER BY bucket DESC
      LIMIT ${limit}`;
  }

  const truncated = rows.length > MAX_HISTORY_POINTS;
  const points = rows
    .slice(0, MAX_HISTORY_POINTS)
    .reverse()
    .map((r) => {
      const { stale, ...point } = formatSnapshot(r);
      return r.bucket ? { bucket: new Date(r.bucket).toISOString(), ...point } : point;
    });

  return {
    interval,
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
    count: points.length,
    truncated,
    points,
  };
}
