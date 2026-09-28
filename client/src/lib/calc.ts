import { D, parseDec, type Dec } from './money'
import type { Currency, Transaction } from './types'

/** Converts `amount` between TZS and USD using `usdTzsRate` (TZS per 1 USD). */
export function convert(amount: Dec, from: Currency, to: Currency, usdTzsRate: Dec): Dec {
  if (from === to) return amount
  return from === 'USD' ? amount.times(usdTzsRate) : amount.div(usdTzsRate)
}

/** fiatAmount / BTC amount; null if there are no sats. */
export function pricePerBtc(fiatAmount: Dec, sats: bigint): Dec | null {
  if (sats <= 0n) return null
  return fiatAmount.div(new D(sats.toString()).div(1e8))
}

/** A transaction's implied price per BTC (fee excluded), in `currency`. */
export function impliedPrice(t: Transaction, currency: Currency = t.fiatCurrency): Dec | null {
  const fiat = parseDec(t.fiatAmount)
  const rate = parseDec(t.usdTzsRate)
  if (!fiat || !rate || rate.isZero()) return null
  const price = pricePerBtc(fiat, BigInt(t.sats))
  return price && convert(price, t.fiatCurrency, currency, rate)
}
