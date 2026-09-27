import Decimal from 'decimal.js'

// Same settings as the server: never use JS floats for money or BTC.
export const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP })
export type Dec = InstanceType<typeof D>

export const SATS_PER_BTC = 100_000_000n
export const MAX_SATS = 21_000_000n * SATS_PER_BTC

export const BTC_PATTERN = /^\d+(\.\d{1,8})?$/
export const SATS_PATTERN = /^\d+$/

/** Parses a plain decimal string; null for empty or invalid input. */
export function parseDec(value: string | null | undefined): Dec | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  if (!/^-?\d+(\.\d+)?$/.test(str) && !/^-?\.\d+$/.test(str)) return null
  return new D(str)
}

/** "0.012" -> 1200000n. Returns null unless the input is a valid BTC amount (≤ 8 dp). */
export function btcToSats(btc: string): bigint | null {
  const str = btc.trim()
  if (!BTC_PATTERN.test(str)) return null
  const [whole, frac = ''] = str.split('.')
  return BigInt(whole) * SATS_PER_BTC + BigInt(frac.padEnd(8, '0'))
}

/** 1200000n -> "0.01200000" (always 8 dp). */
export function satsToBtc(sats: bigint | string): string {
  const s = BigInt(sats)
  const sign = s < 0n ? '-' : ''
  const abs = s < 0n ? -s : s
  return `${sign}${abs / SATS_PER_BTC}.${(abs % SATS_PER_BTC).toString().padStart(8, '0')}`
}

/** Like satsToBtc but without trailing zeros, for form inputs: 1200000n -> "0.012". */
export function satsToBtcInput(sats: bigint | string): string {
  return satsToBtc(sats).replace(/\.?0+$/, '')
}

/** Converts a BTC-amount input string to a sats string, or returns null if it isn't valid. */
export function btcInputToSatsInput(value: string): string | null {
  const sats = btcToSats(value)
  return sats === null ? null : sats.toString()
}

/** Converts a sats input string to a BTC input string, or returns null if it isn't valid. */
export function satsInputToBtcInput(value: string): string | null {
  const str = value.trim()
  if (!SATS_PATTERN.test(str)) return null
  return satsToBtcInput(BigInt(str))
}

/** Amount input (in the chosen unit) -> sats, or null when invalid. */
export function amountToSats(value: string, unit: 'BTC' | 'SATS'): bigint | null {
  if (unit === 'BTC') return btcToSats(value)
  const str = value.trim()
  return SATS_PATTERN.test(str) ? BigInt(str) : null
}
