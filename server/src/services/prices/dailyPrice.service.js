// Daily closing prices (DailyPrice), one row per calendar day in APP_TIMEZONE, for
// charts. Filled by the backfill script from exchange/FX history and every night
// from the day's last PriceSnapshot.

import { prisma } from '../../lib/prisma.js';
import { config } from '../../config.js';
import { toDec } from '../../lib/money.js';
import { addDays, dateToDay, dayKey, dayToDate, eachDay, startOfDay, toRuns } from '../../lib/days.js';
import { CARRIED_FORWARD } from '../portfolio.engine.js';
import { fetchDailyCloses as fetchCoinbaseCloses } from './providers/coinbase.js';
import { fetchDailyCloses as fetchKrakenCloses, OHLC_HISTORY_DAYS } from './providers/kraken.js';
import { fetchPublishedDays, fetchUsdTzsForDate } from './providers/currencyApi.js';
import { findLatestSnapshot } from './price.service.js';

// A backfill makes hundreds of requests: pause between them and retry harder than
// the live job does. Mutable so tests can drop the pause.
export const backfillDefaults = { throttleMs: 250, retries: 4 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const todayIn = (now) => dayKey(now, config.APP_TIMEZONE);
const increment = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

/** Latest rate on or before `day`, else the earliest after it. `anchors` is sorted [[day, rate]]. */
function nearestRate(anchors, day) {
  let lo = 0;
  let hi = anchors.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid][0] <= day) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) return anchors[lo - 1][1];
  return anchors.length ? anchors[0][1] : null;
}

/**
 * Fills DailyPrice for every day from `from` (default: the first transaction's day)
 * to `to` (default and maximum: yesterday) that has no row yet; `force` re-fetches
 * and overwrites every day in the range instead.
 *
 * - BTC/USD: Coinbase Exchange daily close, then Kraken (last 720 days only).
 *   A day neither has is reported as a gap and not written.
 * - USD/TZS: currency-api's rate published for that day. A day without one gets the
 *   nearest earlier real rate (else the nearest later one) with fxSource "carried_forward".
 *
 * Returns a report; see formatBackfillReport.
 */
export async function backfillDailyPrices({ from, to, force = false, now = new Date() } = {}) {
  const tz = config.APP_TIMEZONE;
  const yesterday = addDays(todayIn(now), -1);
  const report = {
    from: null,
    to: null,
    force,
    daysInRange: 0,
    alreadyPresent: 0,
    filled: 0,
    btcSources: {},
    fxSources: {},
    carriedForward: [],
    gaps: { btc: [], fx: [] },
    requests: 0,
    warnings: [],
    note: null,
  };
  const warn = (message) => {
    report.warnings.push(message);
    console.warn(`[backfill] ${message}`);
  };

  if (!from) {
    const first = await prisma.transaction.findFirst({ orderBy: [{ date: 'asc' }, { id: 'asc' }] });
    if (!first) {
      report.note = 'No transactions yet, so there is no start date. Pass --from YYYY-MM-DD.';
      return report;
    }
    from = dayKey(first.date, tz);
  }
  if (!to || to > yesterday) {
    if (to) warn(`${to} isn't over yet in ${tz}; stopping at ${yesterday}`);
    to = yesterday;
  }
  Object.assign(report, { from, to });
  if (from > to) {
    report.note = `Nothing to do: ${from} is after ${to}.`;
    return report;
  }

  const days = eachDay(from, to);
  report.daysInRange = days.length;
  const existing = await prisma.dailyPrice.findMany({
    where: { date: { gte: dayToDate(from), lte: dayToDate(to) } },
    select: { date: true },
  });
  const present = new Set(existing.map((r) => dateToDay(r.date)));
  const targets = force ? days : days.filter((d) => !present.has(d));
  report.alreadyPresent = present.size;
  if (targets.length === 0) {
    console.info(`[backfill] ${from} .. ${to}: all ${days.length} days already present`);
    return report;
  }
  const targetSet = new Set(targets);
  console.info(
    `[backfill] ${from} .. ${to}: ${targets.length} of ${days.length} days to ${force ? 're-fetch' : 'fill'}`,
  );

  const http = { retries: backfillDefaults.retries };
  const politely = async () => {
    if (report.requests > 0 && backfillDefaults.throttleMs > 0) await sleep(backfillDefaults.throttleMs);
    report.requests += 1;
  };

  // 1. BTC/USD daily closes
  const btc = new Map(); // day -> { value: D, source }
  for (const run of toRuns(targets)) {
    try {
      await politely();
      const closes = await fetchCoinbaseCloses(run.from, run.to, { ...http, beforeRequest: politely });
      let found = 0;
      for (const [day, value] of closes) {
        if (!targetSet.has(day)) continue;
        btc.set(day, { value, source: 'coinbase' });
        found += 1;
      }
      console.info(`[backfill] BTC/USD ${run.from} .. ${run.to}: ${found}/${run.days} days from Coinbase`);
    } catch (err) {
      warn(`Coinbase candles for ${run.from} .. ${run.to} failed: ${err.message}`);
    }
  }

  const krakenFrom = addDays(todayIn(now), -(OHLC_HISTORY_DAYS - 1));
  const forKraken = targets.filter((d) => !btc.has(d) && d >= krakenFrom);
  if (forKraken.length) {
    try {
      await politely();
      const closes = await fetchKrakenCloses(http);
      let found = 0;
      for (const day of forKraken) {
        if (!closes.has(day)) continue;
        btc.set(day, { value: closes.get(day), source: 'kraken' });
        found += 1;
      }
      console.info(`[backfill] BTC/USD: ${found}/${forKraken.length} missing days from Kraken`);
    } catch (err) {
      warn(`Kraken OHLC failed: ${err.message}`);
    }
  }
  report.gaps.btc = targets.filter((d) => !btc.has(d));

  // 2. USD/TZS for the days that have a BTC price
  const fxDays = targets.filter((d) => btc.has(d));
  let published = null;
  if (fxDays.length) {
    try {
      await politely();
      published = await fetchPublishedDays(http);
    } catch (err) {
      warn(`Couldn't list published currency-api days (${err.message}); trying every day instead`);
    }
  }
  const toFetch = published ? fxDays.filter((d) => published.has(d)) : fxDays;
  console.info(`[backfill] USD/TZS: ${toFetch.length} of ${fxDays.length} days are published on currency-api`);

  const fetched = new Map(); // day -> D
  for (const [i, day] of toFetch.entries()) {
    try {
      await politely();
      fetched.set(day, (await fetchUsdTzsForDate(day, http)).toDecimalPlaces(4));
    } catch (err) {
      if (err.status !== 404) warn(`currency-api ${day} failed: ${err.message}`);
    }
    if ((i + 1) % 50 === 0 || i + 1 === toFetch.length) {
      console.info(`[backfill] USD/TZS ${i + 1}/${toFetch.length} (${day})`);
    }
  }

  // Carry-forward anchors: real rates fetched now, plus real rates already stored.
  const stored = await prisma.dailyPrice.findMany({
    where: { fxSource: { not: CARRIED_FORWARD } },
    select: { date: true, usdTzs: true },
  });
  const anchorMap = new Map(stored.map((r) => [dateToDay(r.date), toDec(r.usdTzs)]));
  for (const [day, rate] of fetched) anchorMap.set(day, rate);
  if (anchorMap.size === 0) {
    const snapshot = await findLatestSnapshot();
    if (snapshot) anchorMap.set(dayKey(snapshot.timestamp, tz), toDec(snapshot.usdTzs));
  }
  const anchors = [...anchorMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  // 3. Write
  const rows = [];
  const carried = [];
  for (const day of fxDays) {
    let usdTzs = fetched.get(day);
    let fxSource = 'currency-api';
    if (!usdTzs) {
      usdTzs = nearestRate(anchors, day);
      if (!usdTzs) {
        report.gaps.fx.push(day);
        continue;
      }
      fxSource = CARRIED_FORWARD;
      carried.push(day);
    }
    const { value, source } = btc.get(day);
    rows.push({
      date: dayToDate(day),
      btcUsd: value.toDecimalPlaces(2).toFixed(2),
      usdTzs: usdTzs.toDecimalPlaces(4).toFixed(4),
      btcSource: source,
      fxSource,
    });
    increment(report.btcSources, source);
    increment(report.fxSources, fxSource);
  }

  if (force) {
    for (let i = 0; i < rows.length; i += 200) {
      await prisma.$transaction(
        rows.slice(i, i + 200).map((data) =>
          prisma.dailyPrice.upsert({ where: { date: data.date }, create: data, update: data }),
        ),
      );
    }
    report.filled = rows.length;
  } else {
    report.filled = (await prisma.dailyPrice.createMany({ data: rows, skipDuplicates: true })).count;
  }
  report.carriedForward = toRuns(carried);
  console.info(`[backfill] Wrote ${report.filled} days`);
  return report;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const describeCounts = (counts) =>
  Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ') || '-';
const describeRun = (r) => (r.days === 1 ? `${r.from} (1 day)` : `${r.from} .. ${r.to} (${r.days} days)`);

/** Human-readable report for the CLI. */
export function formatBackfillReport(report) {
  if (report.note && !report.daysInRange) return `Backfill: ${report.note}`;
  const carriedDays = report.carriedForward.reduce((n, r) => n + r.days, 0);
  const gapRuns = [...toRuns(report.gaps.btc).map((r) => ['BTC', r]), ...toRuns(report.gaps.fx).map((r) => ['FX', r])];
  const lines = [
    `Backfill report: ${report.from} .. ${report.to}${report.force ? ' (--force)' : ''}`,
    `  Days in range:       ${report.daysInRange}`,
    `  Already present:     ${report.alreadyPresent}${report.force ? ' (re-fetched)' : ''}`,
    `  Days written:        ${report.filled}`,
    `  BTC/USD by source:   ${describeCounts(report.btcSources)}`,
    `  USD/TZS by source:   ${describeCounts(report.fxSources)}`,
    `  Carried forward:     ${plural(carriedDays, 'day')}`,
    ...report.carriedForward.map((r) => `    ${describeRun(r)}`),
    `  Gaps (not written):  ${gapRuns.length ? '' : 'none'}`,
    ...gapRuns.map(([what, r]) => `    ${what}: ${describeRun(r)}`),
    `  HTTP requests:       ${report.requests}`,
  ];
  if (report.warnings.length) {
    lines.push(`  Warnings:            ${report.warnings.length}`, ...report.warnings.map((w) => `    ${w}`));
  }
  return lines.join('\n');
}

/**
 * Nightly rollup: writes DailyPrice for yesterday (and any missing days since the
 * latest row, up to `maxCatchUpDays` back) from each day's last PriceSnapshot. Days
 * without a snapshot are fetched the way the backfill does.
 */
export async function rollupDailyPrices({ now = new Date(), maxCatchUpDays = 31 } = {}) {
  const tz = config.APP_TIMEZONE;
  const yesterday = addDays(todayIn(now), -1);
  const oldest = addDays(yesterday, -(maxCatchUpDays - 1));
  const latest = await prisma.dailyPrice.findFirst({ orderBy: { date: 'desc' } });
  let from = latest ? addDays(dateToDay(latest.date), 1) : yesterday;
  if (from < oldest) from = oldest;
  if (from > yesterday) {
    console.info(`[daily-price] Up to date (latest day ${dateToDay(latest.date)})`);
    return { status: 'up_to_date', fromSnapshots: [], fetched: [] };
  }

  const fromSnapshots = [];
  const missing = [];
  for (const day of eachDay(from, yesterday)) {
    const snapshot = await prisma.priceSnapshot.findFirst({
      where: { timestamp: { gte: startOfDay(day, tz), lt: startOfDay(addDays(day, 1), tz) } },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    });
    if (!snapshot) {
      missing.push(day);
      continue;
    }
    const data = {
      date: dayToDate(day),
      btcUsd: toDec(snapshot.btcUsd).toFixed(2),
      usdTzs: toDec(snapshot.usdTzs).toFixed(4),
      btcSource: 'snapshot',
      fxSource: 'snapshot',
    };
    await prisma.dailyPrice.upsert({ where: { date: data.date }, create: data, update: {} });
    fromSnapshots.push(day);
    console.info(
      `[daily-price] ${day}: BTC/USD ${data.btcUsd}, USD/TZS ${data.usdTzs} from snapshot #${snapshot.id} (${snapshot.timestamp.toISOString()})`,
    );
  }

  const fetched = [];
  for (const run of toRuns(missing)) {
    console.info(`[daily-price] No snapshots for ${describeRun(run)}; fetching like the backfill`);
    const report = await backfillDailyPrices({ from: run.from, to: run.to, now });
    fetched.push(report);
  }
  return { status: 'ok', fromSnapshots, fetched };
}
