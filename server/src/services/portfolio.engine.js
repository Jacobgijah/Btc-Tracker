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
import { COST_METHODS } from '../constants.js';
const SATS_PER_BTC_DEC = new D(SATS_PER_BTC.toString());

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
  const invested = zeroPair();
  let realizedPnl = zeroPair();
  let lots = []; // FIFO only: [{ sats, cost: { USD, TZS } }], oldest first

  for (const raw of sortChronologically(transactions)) {
    const tx = normalize(raw);
    const step = { tx, cost: null, proceeds: null, costOfSold: null, realizedPnl: null };

    if (tx.type === 'BUY' || tx.type === 'TRANSFER_IN') {
      const cost = toPair(tx.fiatAmount.plus(tx.feeAmount), tx.fiatCurrency, tx.usdTzsRate);
      holdingsSats += tx.sats;
      costBasis = addPair(costBasis, cost);
      invested.USD = invested.USD.plus(cost.USD);
      invested.TZS = invested.TZS.plus(cost.TZS);
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

    onStep({ ...step, holdingsSats, costBasis });
  }

  return { holdingsSats, costBasis, invested, realizedPnl };
}

function avgCostPerBtc(costBasis, holdingsSats) {
  if (holdingsSats === 0n) return null;
  return costBasis.times(SATS_PER_BTC_DEC).div(holdingsSats.toString());
}

const fiatOrNull = (d) => (d === null ? null : formatFiat(d));

// ---------------------------------------------------------------------------
// Public API

/** Throws InsufficientHoldingsError if any sell exceeds holdings at its point in time. */
export function assertSufficientHoldings(transactions) {
  replay(transactions, 'AVERAGE');
}

export function computePortfolio({ transactions, price = null, costMethod = 'AVERAGE' }) {
  const state = replay(transactions, costMethod);
  const { holdingsSats } = state;

  let btcUsd = null;
  let usdTzs = null;
  if (price) {
    btcUsd = toDec(price.btcUsd);
    usdTzs = toDec(price.usdTzs);
  }
  const btcPrice = price && { USD: btcUsd, TZS: btcUsd.times(usdTzs) };

  const metrics = (c) => {
    const costBasis = state.costBasis[c];
    const out = {
      invested: formatFiat(state.invested[c]),
      costBasis: formatFiat(costBasis),
      avgCostPerBtc: fiatOrNull(avgCostPerBtc(costBasis, holdingsSats)),
      realizedPnl: formatFiat(state.realizedPnl[c]),
      currentValue: null,
      unrealizedPnl: null,
      unrealizedPnlPct: null,
      totalPnl: null,
    };
    if (btcPrice) {
      const currentValue = btcPrice[c].times(holdingsSats.toString()).div(SATS_PER_BTC_DEC);
      const unrealized = currentValue.minus(costBasis);
      out.currentValue = formatFiat(currentValue);
      out.unrealizedPnl = formatFiat(unrealized);
      out.unrealizedPnlPct = costBasis.isZero() ? null : formatPct(unrealized.div(costBasis).times(100));
      out.totalPnl = formatFiat(state.realizedPnl[c].plus(unrealized));
    }
    return out;
  };

  return {
    costMethod,
    transactionCount: transactions.length,
    holdings: { sats: holdingsSats.toString(), btc: satsToBtc(holdingsSats) },
    price: price
      ? {
          btcUsd: formatFiat(btcUsd),
          usdTzs: formatRate(usdTzs),
          btcTzs: formatFiat(btcPrice.TZS),
          timestamp: price.timestamp ? new Date(price.timestamp).toISOString() : null,
        }
      : null,
    USD: metrics('USD'),
    TZS: metrics('TZS'),
  };
}

/** Each transaction (oldest first) with the running position after it. */
export function computeLedger({ transactions, costMethod = 'AVERAGE' }) {
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
    rows.push({
      ...serializeTransaction(step.tx.source),
      holdingsSats: step.holdingsSats.toString(),
      holdingsBtc: satsToBtc(step.holdingsSats),
      USD: perCurrency('USD'),
      TZS: perCurrency('TZS'),
    });
  });
  return rows;
}
