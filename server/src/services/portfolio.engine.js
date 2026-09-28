// Pure portfolio / P&L engine: no database, no Express.
//
// Every value is tracked in USD and TZS in parallel. A transaction's fiat
// amount is converted with the usdTzsRate stored on that transaction, so the
// TZS view shows what you paid in shillings on the day, and the USD view shows
// what you paid in dollars on the day.

import {
  D,
  SATS_PER_BTC,
  toDec,
  toSats,
  formatFiat,
  formatPct,
  formatRate,
  satsToBtc,
} from '../lib/money.js';
import { serializeTransaction } from '../lib/serialize.js';
import { addMonthsToMonth, dateToDay, dayKey, eachDay, isDay, monthOf } from '../lib/days.js';
import { COST_METHODS } from '../constants.js';
const SATS_PER_BTC_DEC = new D(SATS_PER_BTC.toString());

/** DailyPrice.fxSource for a day whose USD/TZS rate was copied from a neighbouring day. */
export const CARRIED_FORWARD = 'carried_forward';

export class InsufficientHoldingsError extends Error {
  constructor({ transactionId, date, attemptedSats, availableSats }) {
    const day = date.toISOString().slice(0, 10);
    super(
      `Sell of ${attemptedSats} sats on ${day} exceeds holdings of ${availableSats} sats at that point`,
    );
    this.name = 'InsufficientHoldingsError';
    this.transactionId = transactionId;
    this.date = date;
    this.attemptedSats = attemptedSats;
    this.availableSats = availableSats;
  }
}

// ---------------------------------------------------------------------------
// Helpers for { USD, TZS } pairs

const zeroPair = () => ({ USD: new D(0), TZS: new D(0) });
const mapPair = (fn) => ({ USD: fn('USD'), TZS: fn('TZS') });
const addPair = (a, b) => mapPair((c) => a[c].plus(b[c]));
const subPair = (a, b) => mapPair((c) => a[c].minus(b[c]));

/** Expresses a fiat amount in both currencies using the trade-date rate. */
function toPair(amount, currency, usdTzsRate) {
  if (currency === 'USD') return { USD: amount, TZS: amount.times(usdTzsRate) };
  if (currency === 'TZS') return { USD: amount.div(usdTzsRate), TZS: amount };
  throw new TypeError(`Unknown fiatCurrency: ${currency}`);
}

/** value * part / whole, with the full-consumption case kept exact. */
function proportion(value, part, whole) {
  if (part === whole) return value;
  return value.times(part.toString()).div(whole.toString());
}

// ---------------------------------------------------------------------------
// Replay

/** Chronological order: date ASC, then id ASC. Unsaved rows (id null) sort last. */
export function sortChronologically(transactions) {
  const idKey = (t) => (t.id === null || t.id === undefined ? Infinity : Number(t.id));
  return [...transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date) || idKey(a) - idKey(b),
  );
}

function normalize(tx) {
  const date = new Date(tx.date);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date on transaction ${tx.id}`);
  return {
    source: tx,
    id: tx.id ?? null,
    type: tx.type,
    date,
    sats: toSats(tx.sats),
    fiatAmount: toDec(tx.fiatAmount),
    feeAmount: toDec(tx.feeAmount ?? 0),
    fiatCurrency: tx.fiatCurrency,
    usdTzsRate: toDec(tx.usdTzsRate),
  };
}

/**
 * Replays transactions and calls onStep(step) after each one.
 * Returns the final state. Throws InsufficientHoldingsError on an over-sell.
 */
function replay(transactions, costMethod, onStep = () => {}) {
  if (!COST_METHODS.includes(costMethod)) {
    throw new TypeError(`Unknown costMethod: ${costMethod}`);
  }

  let holdingsSats = 0n;
  let costBasis = zeroPair();
  let invested = zeroPair();
  let realizedPnl = zeroPair();
  let lots = []; // FIFO only: [{ sats, cost: { USD, TZS } }], oldest first

  for (const raw of sortChronologically(transactions)) {
    const tx = normalize(raw);
    const step = { tx, cost: null, proceeds: null, costOfSold: null, realizedPnl: null };

    if (tx.type === 'BUY' || tx.type === 'TRANSFER_IN') {
      const cost = toPair(tx.fiatAmount.plus(tx.feeAmount), tx.fiatCurrency, tx.usdTzsRate);
      holdingsSats += tx.sats;
      costBasis = addPair(costBasis, cost);
      invested = addPair(invested, cost);
      if (costMethod === 'FIFO') lots.push({ sats: tx.sats, cost });
      step.cost = cost;
    } else if (tx.type === 'SELL') {
      if (tx.sats > holdingsSats) {
        throw new InsufficientHoldingsError({
          transactionId: tx.id,
          date: tx.date,
          attemptedSats: tx.sats.toString(),
          availableSats: holdingsSats.toString(),
        });
      }

      const proceeds = toPair(tx.fiatAmount.minus(tx.feeAmount), tx.fiatCurrency, tx.usdTzsRate);
      let costOfSold;

      if (costMethod === 'AVERAGE') {
        costOfSold = mapPair((c) => proportion(costBasis[c], tx.sats, holdingsSats));
        costBasis = subPair(costBasis, costOfSold);
      } else {
        costOfSold = zeroPair();
        let remaining = tx.sats;
        const nextLots = [];
        for (const lot of lots) {
          if (remaining === 0n) {
            nextLots.push(lot);
            continue;
          }
          const used = remaining < lot.sats ? remaining : lot.sats;
          const usedCost = mapPair((c) => proportion(lot.cost[c], used, lot.sats));
          costOfSold = addPair(costOfSold, usedCost);
          remaining -= used;
          if (used < lot.sats) {
            nextLots.push({ sats: lot.sats - used, cost: subPair(lot.cost, usedCost) });
          }
        }
        lots = nextLots;
        // Cost basis is exactly what the remaining lots cost.
        costBasis = lots.reduce((sum, lot) => addPair(sum, lot.cost), zeroPair());
      }

      holdingsSats -= tx.sats;
      const pnl = subPair(proceeds, costOfSold);
      realizedPnl = addPair(realizedPnl, pnl);
      Object.assign(step, { proceeds, costOfSold, realizedPnl: pnl });
    } else {
      throw new TypeError(`Unknown transaction type: ${tx.type}`);
    }

    // Pairs are never mutated, so steps can be kept as snapshots of the position.
    onStep({ ...step, holdingsSats, costBasis, invested, realizedPnlTotal: realizedPnl });
  }

  return { holdingsSats, costBasis, invested, realizedPnl };
}

// ---------------------------------------------------------------------------
// Valuation (shared by the summary, the history and the ledger)

function avgCostPerBtc(costBasis, holdingsSats) {
  if (holdingsSats === 0n) return null;
  return costBasis.times(SATS_PER_BTC_DEC).div(holdingsSats.toString());
}

const fiatOrNull = (d) => (d === null ? null : formatFiat(d));

/** { btcUsd, usdTzs } -> the BTC price in both currencies (BTC/TZS is always derived), or null. */
function btcPricePair(price) {
  if (!price) return null;
  const btcUsd = toDec(price.btcUsd);
  const usdTzs = toDec(price.usdTzs);
  return { btcUsd, usdTzs, USD: btcUsd, TZS: btcUsd.times(usdTzs) };
}

/**
 * Values a position ({ holdingsSats, costBasis, realizedPnl }) at a BTC price,
 * in currency `c`, at full precision. Price-dependent fields are null without a price.
 */
function valuePosition(position, btcPrice, c) {
  const { holdingsSats } = position;
  const costBasis = position.costBasis[c];
  const realizedPnl = position.realizedPnl[c];
  const out = {
    costBasis,
    avgCostPerBtc: avgCostPerBtc(costBasis, holdingsSats),
    realizedPnl,
    currentValue: null,
    unrealizedPnl: null,
    unrealizedPnlPct: null,
    totalPnl: null,
  };
  if (btcPrice) {
    out.currentValue = btcPrice[c].times(holdingsSats.toString()).div(SATS_PER_BTC_DEC);
    out.unrealizedPnl = out.currentValue.minus(costBasis);
    out.unrealizedPnlPct = costBasis.isZero() ? null : out.unrealizedPnl.div(costBasis).times(100);
    out.totalPnl = realizedPnl.plus(out.unrealizedPnl);
  }
  return out;
}

/**
 * Splits TZS unrealized P/L into what BTC's move did and what the shilling's move did:
 *   btcEffect = USD unrealizedPnl × usdTzs now
 *   fxEffect  = USD costBasis × usdTzs now − TZS costBasis
 * Exactly, btcEffect + fxEffect = USD value × usdTzs − TZS costBasis = TZS unrealizedPnl.
 * Each part is rounded to 2 dp for output; fxEffect is taken as the rounded total minus the
 * rounded btcEffect so the two printed parts always add up to the printed total (it can
 * differ from rounding fxEffect on its own by at most 0.01).
 */
function fxEffects(usd, tzs, btcPrice) {
  if (!btcPrice) return { btcEffect: null, fxEffect: null };
  const btcEffect = usd.unrealizedPnl.times(btcPrice.usdTzs).toDecimalPlaces(2);
  const total = tzs.unrealizedPnl.toDecimalPlaces(2);
  return { btcEffect: formatFiat(btcEffect), fxEffect: formatFiat(total.minus(btcEffect)) };
}

/**
 * Price for each day, asked in ascending day order: that day's daily price, else the
 * most recent earlier one ("carried_forward"). `live` is used for `liveDay` ("live").
 * A daily row whose fxSource is carried_forward also reports "carried_forward".
 */
function createPriceLookup(dailyPrices, live, liveDay) {
  const rows = dailyPrices
    .map((p) => ({
      day: isDay(p.date) ? p.date : dateToDay(new Date(p.date)),
      btcUsd: p.btcUsd,
      usdTzs: p.usdTzs,
      carriedForward: p.fxSource === CARRIED_FORWARD,
    }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  let next = 0;
  let last = null;
  return (day) => {
    while (next < rows.length && rows[next].day <= day) last = rows[next++];
    if (live && day === liveDay) return { btcUsd: live.btcUsd, usdTzs: live.usdTzs, source: 'live' };
    if (!last) return null;
    const source = last.day === day && !last.carriedForward ? 'daily' : CARRIED_FORWARD;
    return { btcUsd: last.btcUsd, usdTzs: last.usdTzs, source };
  };
}

// ---------------------------------------------------------------------------
// Public API

/** Throws InsufficientHoldingsError if any sell exceeds holdings at its point in time. */
export function assertSufficientHoldings(transactions) {
  replay(transactions, 'AVERAGE');
}

export function computePortfolio({ transactions, price = null, costMethod = 'AVERAGE' }) {
  const state = replay(transactions, costMethod);
  const { holdingsSats } = state;
  const btcPrice = btcPricePair(price);
  const values = mapPair((c) => valuePosition(state, btcPrice, c));

  const metrics = (c) => {
    const v = values[c];
    return {
      invested: formatFiat(state.invested[c]),
      costBasis: formatFiat(v.costBasis),
      avgCostPerBtc: fiatOrNull(v.avgCostPerBtc),
      realizedPnl: formatFiat(v.realizedPnl),
      currentValue: fiatOrNull(v.currentValue),
      unrealizedPnl: fiatOrNull(v.unrealizedPnl),
      unrealizedPnlPct: v.unrealizedPnlPct === null ? null : formatPct(v.unrealizedPnlPct),
      totalPnl: fiatOrNull(v.totalPnl),
    };
  };

  return {
    costMethod,
    transactionCount: transactions.length,
    holdings: { sats: holdingsSats.toString(), btc: satsToBtc(holdingsSats) },
    price: price
      ? {
          btcUsd: formatFiat(btcPrice.btcUsd),
          usdTzs: formatRate(btcPrice.usdTzs),
          btcTzs: formatFiat(btcPrice.TZS),
          timestamp: price.timestamp ? new Date(price.timestamp).toISOString() : null,
        }
      : null,
    USD: metrics('USD'),
    TZS: { ...metrics('TZS'), ...fxEffects(values.USD, values.TZS, btcPrice) },
  };
}

/**
 * Each transaction (oldest first) with the running position after it. With
 * `dailyPrices`, rows also carry `marketPrice`: the BTC price on that day
 * (the live price for `today`), for placing trades on a price chart.
 */
export function computeLedger({
  transactions,
  costMethod = 'AVERAGE',
  dailyPrices = [],
  latestPrice = null,
  today = null,
  timeZone = 'UTC',
}) {
  const priceOn = createPriceLookup(dailyPrices, latestPrice, today);
  const rows = [];
  replay(transactions, costMethod, (step) => {
    const perCurrency = (c) => ({
      cost: step.cost && formatFiat(step.cost[c]),
      proceeds: step.proceeds && formatFiat(step.proceeds[c]),
      costBasis: formatFiat(step.costBasis[c]),
      avgCostPerBtc: fiatOrNull(avgCostPerBtc(step.costBasis[c], step.holdingsSats)),
      costOfSold: step.costOfSold && formatFiat(step.costOfSold[c]),
      realizedPnl: step.realizedPnl && formatFiat(step.realizedPnl[c]),
    });
    const day = dayKey(step.tx.date, timeZone);
    const market = priceOn(day);
    const marketPair = btcPricePair(market);
    rows.push({
      ...serializeTransaction(step.tx.source),
      day,
      holdingsSats: step.holdingsSats.toString(),
      holdingsBtc: satsToBtc(step.holdingsSats),
      marketPrice: market && {
        btcUsd: formatFiat(marketPair.btcUsd),
        usdTzs: formatRate(marketPair.usdTzs),
        btcTzs: formatFiat(marketPair.TZS),
        source: market.source,
      },
      USD: perCurrency('USD'),
      TZS: perCurrency('TZS'),
    });
  });
  return rows;
}

/**
 * One point per day from `from` to `to` ("YYYY-MM-DD", inclusive), replaying the
 * ledger with the same maths as computePortfolio. Transactions before `from` count
 * towards the position; those after `to` are ignored. Days are calendar days in
 * `timeZone`.
 *
 * Each day is valued at that day's daily price; a day without one reuses the previous
 * day's price (priceSource "carried_forward"). The `to` day uses `latestPrice` when given
 * ("live"), so the last point equals computePortfolio with price = latestPrice.
 * Before the first known price, price-dependent fields are null (priceSource null).
 */
export function computeHistory({
  transactions,
  dailyPrices = [],
  latestPrice = null,
  costMethod = 'AVERAGE',
  from,
  to,
  timeZone = 'UTC',
}) {
  if (!isDay(from) || !isDay(to)) throw new TypeError('from and to must be YYYY-MM-DD days');

  const steps = [];
  replay(transactions, costMethod, (step) => steps.push({ ...step, day: dayKey(step.tx.date, timeZone) }));
  const priceOn = createPriceLookup(dailyPrices, latestPrice, to);

  const points = [];
  let position = { holdingsSats: 0n, costBasis: zeroPair(), realizedPnl: zeroPair() };
  let next = 0;

  for (const day of eachDay(from, to)) {
    let investedThatDay = zeroPair();
    let transactionCount = 0;
    while (next < steps.length && steps[next].day <= day) {
      const step = steps[next++];
      position = { holdingsSats: step.holdingsSats, costBasis: step.costBasis, realizedPnl: step.realizedPnlTotal };
      if (step.day === day) {
        transactionCount += 1;
        if (step.cost) investedThatDay = addPair(investedThatDay, step.cost);
      }
    }

    const price = priceOn(day);
    const btcPrice = btcPricePair(price);
    const perCurrency = (c) => {
      const v = valuePosition(position, btcPrice, c);
      return {
        btcPrice: btcPrice && formatFiat(btcPrice[c]),
        costBasis: formatFiat(v.costBasis),
        currentValue: fiatOrNull(v.currentValue),
        unrealizedPnl: fiatOrNull(v.unrealizedPnl),
        unrealizedPnlPct: v.unrealizedPnlPct === null ? null : formatPct(v.unrealizedPnlPct),
        realizedPnlCumulative: formatFiat(v.realizedPnl),
        avgCostPerBtc: fiatOrNull(v.avgCostPerBtc),
        investedThatDay: formatFiat(investedThatDay[c]),
      };
    };

    points.push({
      date: day,
      holdingsSats: position.holdingsSats.toString(),
      btcUsd: btcPrice && formatFiat(btcPrice.btcUsd),
      usdTzs: btcPrice && formatRate(btcPrice.usdTzs),
      priceSource: price?.source ?? null,
      transactionCount,
      USD: perCurrency('USD'),
      TZS: perCurrency('TZS'),
    });
  }
  return points;
}

/**
 * Thins a daily series to about `maxPoints`: always keeps the first and last point and
 * every day with a transaction (so stepped lines change on the right day), then fills the
 * remaining budget with evenly spaced days.
 */
export function downsampleHistory(points, maxPoints = 400) {
  if (points.length <= maxPoints) return points;
  const keep = new Set([0, points.length - 1]);
  points.forEach((p, i) => {
    if (p.transactionCount > 0) keep.add(i);
  });
  const slots = maxPoints - keep.size;
  if (slots > 0) {
    // Array indices, not money: plain numbers are fine here.
    const stride = (points.length - 1) / (slots + 1);
    for (let k = 1; k <= slots; k++) keep.add(Math.round(k * stride));
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}

/**
 * Per calendar month (in `timeZone`), from the first transaction's month through
 * `throughMonth` ("YYYY-MM", e.g. the current month) or the last transaction's month.
 * Months without activity are included with zeros.
 *
 * - invested: cost (amount + fee) of BUYs and TRANSFER_INs, like the summary's `invested`
 * - received: SELL proceeds (amount − fee)
 * - satsAcquired: BUY + TRANSFER_IN sats; satsSold: SELL sats
 * - avgBuyPrice: BUY cost incl. fees per BTC bought that month (null without buys)
 *
 * Summary: monthsSaved (months with at least one BUY), averagePerMonth (BUY cost ÷
 * monthsSaved), and currentStreak: consecutive months with a BUY ending at the last month,
 * or at the month before if the last month is `throughMonth` and has no BUY yet (it isn't over).
 */
export function computeMonthly({ transactions, timeZone = 'UTC', throughMonth = null }) {
  const txs = sortChronologically(transactions).map(normalize);
  const emptyTotals = { totalInvested: '0.00', averagePerMonth: null };
  if (txs.length === 0) {
    return { months: [], summary: { monthsSaved: 0, currentStreak: 0, USD: emptyTotals, TZS: emptyTotals } };
  }

  const monthOfTx = (tx) => monthOf(dayKey(tx.date, timeZone));
  const first = monthOfTx(txs[0]);
  const lastTx = monthOfTx(txs.at(-1));
  const last = throughMonth && throughMonth > lastTx ? throughMonth : lastTx;

  const byMonth = new Map();
  for (let m = first; m <= last; m = addMonthsToMonth(m, 1)) {
    byMonth.set(m, {
      invested: zeroPair(),
      received: zeroPair(),
      bought: zeroPair(),
      satsBought: 0n,
      satsAcquired: 0n,
      satsSold: 0n,
      buyCount: 0,
      sellCount: 0,
      transferInCount: 0,
    });
  }

  for (const tx of txs) {
    const row = byMonth.get(monthOfTx(tx));
    if (tx.type === 'SELL') {
      row.received = addPair(row.received, toPair(tx.fiatAmount.minus(tx.feeAmount), tx.fiatCurrency, tx.usdTzsRate));
      row.satsSold += tx.sats;
      row.sellCount += 1;
      continue;
    }
    const cost = toPair(tx.fiatAmount.plus(tx.feeAmount), tx.fiatCurrency, tx.usdTzsRate);
    row.invested = addPair(row.invested, cost);
    row.satsAcquired += tx.sats;
    if (tx.type === 'BUY') {
      row.bought = addPair(row.bought, cost);
      row.satsBought += tx.sats;
      row.buyCount += 1;
    } else {
      row.transferInCount += 1;
    }
  }

  const entries = [...byMonth.entries()];
  const months = entries.map(([month, r]) => {
    const perCurrency = (c) => ({
      invested: formatFiat(r.invested[c]),
      received: formatFiat(r.received[c]),
      avgBuyPrice: r.satsBought === 0n ? null : formatFiat(r.bought[c].times(SATS_PER_BTC_DEC).div(r.satsBought.toString())),
    });
    return {
      month,
      satsAcquired: r.satsAcquired.toString(),
      satsSold: r.satsSold.toString(),
      buyCount: r.buyCount,
      sellCount: r.sellCount,
      transferInCount: r.transferInCount,
      USD: perCurrency('USD'),
      TZS: perCurrency('TZS'),
    };
  });

  const saved = entries.filter(([, r]) => r.buyCount > 0);
  let i = entries.length - 1;
  if (entries[i][0] === throughMonth && entries[i][1].buyCount === 0) i -= 1;
  let currentStreak = 0;
  while (i >= 0 && entries[i][1].buyCount > 0) {
    currentStreak += 1;
    i -= 1;
  }

  const totals = (c) => {
    const bought = saved.reduce((sum, [, r]) => sum.plus(r.bought[c]), new D(0));
    const invested = entries.reduce((sum, [, r]) => sum.plus(r.invested[c]), new D(0));
    return {
      totalInvested: formatFiat(invested),
      averagePerMonth: saved.length ? formatFiat(bought.div(saved.length)) : null,
    };
  };

  return {
    months,
    summary: { monthsSaved: saved.length, currentStreak, USD: totals('USD'), TZS: totals('TZS') },
  };
}
