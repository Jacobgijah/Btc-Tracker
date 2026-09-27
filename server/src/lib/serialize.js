import { formatFiat, formatRate, satsToBtc } from './money.js';

/** Shapes a transaction for JSON output: every number as a string. */
export function serializeTransaction(t) {
  return {
    id: t.id ?? null,
    type: t.type,
    date: new Date(t.date).toISOString(),
    sats: BigInt(t.sats).toString(),
    btc: satsToBtc(t.sats),
    fiatAmount: formatFiat(t.fiatAmount),
    feeAmount: formatFiat(t.feeAmount ?? 0),
    fiatCurrency: t.fiatCurrency,
    usdTzsRate: formatRate(t.usdTzsRate),
    exchange: t.exchange ?? null,
    note: t.note ?? null,
    ...(t.createdAt && { createdAt: new Date(t.createdAt).toISOString() }),
    ...(t.updatedAt && { updatedAt: new Date(t.updatedAt).toISOString() }),
  };
}
