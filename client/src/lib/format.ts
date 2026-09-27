// All display formatting lives here. Inputs are the API's decimal strings (or
// decimal.js values); rounding is done with decimal.js, never JS floats.

import { D, type Dec } from './money'
import type { Currency } from './types'

export const DASH = '—'
/** Typographic minus sign, used for negative numbers. */
export const MINUS = '−'

type NumLike = string | number | bigint | Dec | null | undefined

function toDec(value: NumLike): Dec | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof D) return value
  try {
    const d = new D(typeof value === 'bigint' ? value.toString() : value)
    return d.isFinite() ? d : null
  } catch {
    return null
  }
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Rounds |d| to `dp` places (half up) and adds thousands separators. */
function absFixed(d: Dec, dp: number): string {
  const [int, frac] = d.abs().toFixed(dp).split('.')
  return frac === undefined ? groupThousands(int) : `${groupThousands(int)}.${frac}`
}

/** Sign for a value rounded to `dp`: "−" for negatives, "+" for positives when `signed`. */
function signFor(d: Dec, dp: number, signed: boolean): string {
  const rounded = d.toDecimalPlaces(dp)
  if (rounded.isZero()) return ''
  if (rounded.isNegative()) return MINUS
  return signed ? '+' : ''
}

export interface FormatOptions {
  /** Prefix positive values with "+" (for P/L). */
  signed?: boolean
}

/** "TSh 1,234,567" — no decimals. */
export function formatTZS(value: NumLike, { signed = false }: FormatOptions = {}): string {
  const d = toDec(value)
  if (!d) return DASH
  return `${signFor(d, 0, signed)}TSh ${absFixed(d, 0)}`
}

/** "$1,234.56" */
export function formatUSD(value: NumLike, { signed = false }: FormatOptions = {}): string {
  const d = toDec(value)
  if (!d) return DASH
  return `${signFor(d, 2, signed)}$${absFixed(d, 2)}`
}

export function formatFiat(value: NumLike, currency: Currency, opts?: FormatOptions): string {
  return currency === 'TZS' ? formatTZS(value, opts) : formatUSD(value, opts)
}

/** "0.01200000 BTC" — always 8 decimals. */
export function formatBTC(value: NumLike): string {
  const d = toDec(value)
  if (!d) return DASH
  return `${signFor(d, 8, false)}${absFixed(d, 8)} BTC`
}

/** "1,200,000 sats" */
export function formatSats(value: NumLike): string {
  const d = toDec(value)
  if (!d) return DASH
  return `${signFor(d, 0, false)}${absFixed(d, 0)} sats`
}

/** "+8.64%" / "−2.10%" / "0.00%" — always signed. */
export function formatPct(value: NumLike): string {
  const d = toDec(value)
  if (!d) return DASH
  return `${signFor(d, 2, true)}${absFixed(d, 2)}%`
}

/** USD/TZS rate for display: "2,656.35". */
export function formatRate(value: NumLike, dp = 2): string {
  const d = toDec(value)
  if (!d) return DASH
  return `${signFor(d, dp, false)}${absFixed(d, dp)}`
}

export type Tone = 'positive' | 'negative' | 'neutral'

/** Colour tone for a P/L value: zero, null and invalid values are neutral. */
export function plTone(value: NumLike): Tone {
  const d = toDec(value)
  if (!d || d.isZero()) return 'neutral'
  return d.isNegative() ? 'negative' : 'positive'
}

export const TONE_CLASSES: Record<Tone, string> = {
  positive: 'text-emerald-700 dark:text-emerald-400',
  negative: 'text-red-700 dark:text-red-400',
  neutral: 'text-slate-600 dark:text-slate-300',
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function formatRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return DASH
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return DASH
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** "27 Sep 2026, 14:30" in local time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? DASH : dateTimeFmt.format(d)
}

/** "27 Sep 2026" in local time. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d)
}

export const TYPE_LABELS = {
  BUY: 'Buy',
  SELL: 'Sell',
  TRANSFER_IN: 'Transfer in',
} as const
