import Decimal from 'decimal.js';

// Isolated Decimal constructor: high precision for intermediate results
// (divisions by FX rates repeat forever), ROUND_HALF_UP when formatting.
export const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export const SATS_PER_BTC = 100_000_000n;
export const MAX_SATS = 21_000_000n * SATS_PER_BTC;

/** Converts a string, integer, bigint, D or Prisma.Decimal into a D. */
export function toDec(value) {
  if (value instanceof D) return value;
  if (value === null || value === undefined) {
    throw new TypeError('Expected a decimal value, got ' + value);
  }
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new TypeError(`Refusing to build a decimal from float ${value}; pass a string`);
  }
  // Prisma.Decimal comes from a different Decimal class, so go through a string.
  return new D(typeof value === 'object' || typeof value === 'bigint' ? value.toString() : value);
}

export function toSats(value) {
  const sats = typeof value === 'bigint' ? value : BigInt(value);
  if (sats <= 0n) throw new TypeError(`sats must be positive, got ${sats}`);
  return sats;
}

function withoutNegativeZero(str) {
  return /^-0(\.0+)?$/.test(str) ? str.slice(1) : str;
}

/** Fiat amounts: 2 dp, ROUND_HALF_UP. */
export const formatFiat = (d) => withoutNegativeZero(toDec(d).toFixed(2));

/** Percentages: 2 dp, ROUND_HALF_UP. */
export const formatPct = (d) => withoutNegativeZero(toDec(d).toFixed(2));

/** FX rates keep the 4 dp they are stored with. */
export const formatRate = (d) => toDec(d).toFixed(4);

/** Exact sats -> "0.01200000" BTC string via integer arithmetic. */
export function satsToBtc(sats) {
  const s = BigInt(sats);
  const sign = s < 0n ? '-' : '';
  const abs = s < 0n ? -s : s;
  return `${sign}${abs / SATS_PER_BTC}.${(abs % SATS_PER_BTC).toString().padStart(8, '0')}`;
}

/** Exact "0.012" BTC string -> 1200000n sats. Caller guarantees <= 8 dp. */
export function btcToSats(btc) {
  const [whole, frac = ''] = String(btc).split('.');
  return BigInt(whole) * SATS_PER_BTC + BigInt(frac.padEnd(8, '0'));
}
