import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { addMonths, dayKey, dayToDate, monthOf } from '../lib/days.js';
import {
  CARRIED_FORWARD,
  computePortfolio,
  computeLedger,
  computeHistory,
  computeMonthly,
  downsampleHistory,
} from './portfolio.engine.js';
import { getSettings } from './settings.service.js';
import { findLatestSnapshot, isStale } from './prices/price.service.js';

const CHRONOLOGICAL = [{ date: 'asc' }, { id: 'asc' }];

/** Months covered by each history range; ALL starts at the first transaction. */
export const HISTORY_RANGES = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, ALL: null };
export const MAX_HISTORY_POINTS = 400;

async function loadInputs(userId) {
  const [transactions, snapshot, settings] = await Promise.all([
    prisma.transaction.findMany({ where: { userId }, orderBy: CHRONOLOGICAL }),
    findLatestSnapshot(),
    getSettings(userId),
  ]);
  const price = snapshot && {
    btcUsd: snapshot.btcUsd,
    usdTzs: snapshot.usdTzs,
    timestamp: snapshot.timestamp,
  };
  return { transactions, price, costMethod: settings.costMethod, settings };
}

const today = () => dayKey(new Date(), config.APP_TIMEZONE);

/** Keeps only one currency's block, merged into the row: { USD, TZS, ...rest } -> { ...rest, ...USD }. */
const pickCurrency = ({ USD, TZS, ...rest }, currency) => ({ ...rest, ...(currency === 'USD' ? USD : TZS) });

export async function getPortfolioSummary(userId) {
  const { settings, ...inputs } = await loadInputs(userId);
  const summary = computePortfolio(inputs);
  if (summary.price) summary.price.stale = isStale(inputs.price.timestamp);
  return summary;
}

export async function getLedger(userId) {
  const { transactions, price, costMethod } = await loadInputs(userId);
  const dailyPrices = await prisma.dailyPrice.findMany({ orderBy: { date: 'asc' } });
  return computeLedger({
    transactions,
    costMethod,
    dailyPrices,
    latestPrice: price,
    today: today(),
    timeZone: config.APP_TIMEZONE,
  });
}

/**
 * Daily value/cost/P&L series for `range`, in one currency (default: the display
 * currency), thinned to about MAX_HISTORY_POINTS.
 */
export async function getHistory(userId, { range, currency }) {
  const { transactions, price, costMethod, settings } = await loadInputs(userId);
  const tz = config.APP_TIMEZONE;
  const to = today();
  currency ??= settings.displayCurrency;
  const result = {
    range,
    currency,
    costMethod,
    timeZone: tz,
    from: null,
    to,
    totalDays: 0,
    pointCount: 0,
    downsampled: false,
    daysWithCarriedForwardPrices: 0,
    daysWithoutPrice: 0,
    points: [],
  };
  if (transactions.length === 0) return result;

  // No point showing days before the first transaction.
  const firstDay = dayKey(transactions[0].date, tz);
  const months = HISTORY_RANGES[range];
  let from = months === null ? firstDay : addMonths(to, -months);
  if (from < firstDay) from = firstDay;
  if (from > to) from = to;

  const [inRange, before] = await Promise.all([
    prisma.dailyPrice.findMany({
      where: { date: { gte: dayToDate(from), lte: dayToDate(to) } },
      orderBy: { date: 'asc' },
    }),
    // So the first day can carry a price forward if it has none of its own.
    prisma.dailyPrice.findFirst({ where: { date: { lt: dayToDate(from) } }, orderBy: { date: 'desc' } }),
  ]);
  const daily = computeHistory({
    transactions,
    dailyPrices: before ? [before, ...inRange] : inRange,
    latestPrice: price,
    costMethod,
    from,
    to,
    timeZone: tz,
  });
  const points = downsampleHistory(daily, MAX_HISTORY_POINTS);

  return {
    ...result,
    from,
    totalDays: daily.length,
    pointCount: points.length,
    downsampled: points.length < daily.length,
    daysWithCarriedForwardPrices: daily.filter((p) => p.priceSource === CARRIED_FORWARD).length,
    daysWithoutPrice: daily.filter((p) => p.priceSource === null).length,
    points: points.map((p) => pickCurrency(p, currency)),
  };
}

/** Per-month savings activity in one currency (default: the display currency). */
export async function getMonthly(userId, { currency }) {
  const [transactions, settings] = await Promise.all([
    prisma.transaction.findMany({ where: { userId }, orderBy: CHRONOLOGICAL }),
    getSettings(userId),
  ]);
  currency ??= settings.displayCurrency;
  const { months, summary } = computeMonthly({
    transactions,
    timeZone: config.APP_TIMEZONE,
    throughMonth: monthOf(today()),
  });
  return {
    currency,
    timeZone: config.APP_TIMEZONE,
    months: months.map((m) => pickCurrency(m, currency)),
    summary: {
      monthsSaved: summary.monthsSaved,
      currentStreak: summary.currentStreak,
      ...summary[currency],
    },
  };
}
