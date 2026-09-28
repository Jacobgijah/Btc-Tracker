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

// ---------------------------------------------------------------------------
// Compact formats, for chart axes and tight spaces

const COMPACT_UNITS: [suffix: string, size: Dec][] = [
  ['T', new D('1e12')],
  ['B', new D('1e9')],
  ['M', new D('1e6')],
  ['K', new D('1e3')],
]

/** |d| to at most 3 significant figures with a K/M/B/T suffix: 3.6M, 12.3K, 950, 27.2, 0.5. */
function compactAbs(d: Dec): string {
  const abs = d.abs()
  // Largest unit first; a value that rounds up to 1000 of a unit moves to the next one.
  for (let i = 0; i < COMPACT_UNITS.length; i++) {
    const [suffix, size] = COMPACT_UNITS[i]
    if (abs.lt(size)) continue
    const scaled = abs.div(size)
    const rounded = scaled.toDecimalPlaces(scaled.gte(100) ? 0 : 1)
    if (rounded.gte(1000) && i > 0) return `${abs.div(COMPACT_UNITS[i - 1][1]).toDecimalPlaces(1).toFixed()}${COMPACT_UNITS[i - 1][0]}`
    return `${rounded.toFixed()}${suffix}`
  }
  const small = abs.gte(100) ? abs.toDecimalPlaces(0) : abs.toDecimalPlaces(abs.gte(10) ? 1 : 2)
  return small.gte(1000) ? '1K' : small.toFixed()
}

function compactSign(d: Dec, text: string, signed: boolean): string {
  if (/^0(\.0+)?[KMBT]?$/.test(text)) return ''
  if (d.isNegative()) return MINUS
  return signed ? '+' : ''
}

/** "TSh 3.6M", "$1.2K", "$950", "−$27.2" — for axis ticks and small labels. */
export function formatCompactFiat(value: NumLike, currency: Currency, { signed = false }: FormatOptions = {}): string {
  const d = toDec(value)
  if (!d) return DASH
  const text = compactAbs(d)
  return `${compactSign(d, text, signed)}${currency === 'TZS' ? 'TSh ' : '$'}${text}`
}

/** "1.2M sats" */
export function formatCompactSats(value: NumLike): string {
  const d = toDec(value)
  if (!d) return DASH
  const text = compactAbs(d)
  return `${compactSign(d, text, false)}${text} sats`
}

/** BTC without trailing zeros, for axes: "0.012 BTC", "1.5 BTC". */
export function formatCompactBTC(value: NumLike): string {
  const d = toDec(value)
  if (!d) return DASH
  const text = d.abs().toDecimalPlaces(8).toFixed()
  return `${d.isNegative() && text !== '0' ? MINUS : ''}${text} BTC`
}

// Calendar days ("YYYY-MM-DD") and months ("YYYY-MM") from the server are dates, not
// instants, so they are formatted in UTC to never shift by a day.
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayMonthFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const monthYearFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function parseDay(day: string | null | undefined): Date | null {
  if (!day || !/^\d{4}-\d{2}(-\d{2})?$/.test(day)) return null
  const d = new Date(`${day.length === 7 ? `${day}-01` : day}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "10 Jan 2026" */
export function formatDay(day: string | null | undefined): string {
  const d = parseDay(day)
  return d ? dayFmt.format(d) : DASH
}

/** "Jan 2026" for "2026-01"; `short` gives "Jan". */
export function formatMonth(month: string | null | undefined, { short = false } = {}): string {
  const d = parseDay(month)
  return d ? (short ? monthFmt : monthYearFmt).format(d) : DASH
}

/**
 * Axis label for a day, detailed enough for the visible span:
 * up to ~3 months "10 Jan"; up to ~13 months "Jan"; longer "Jan 2026".
 */
export function formatAxisDay(day: string, spanDays: number): string {
  const d = parseDay(day)
  if (!d) return ''
  if (spanDays <= 100) return dayMonthFmt.format(d)
  if (spanDays <= 400) return monthFmt.format(d)
  return monthYearFmt.format(d)
}

export type Tone = 'positive' | 'negative' | 'neutral'

/**
 * Tone of a P/L value: null, invalid and values that round to zero (at `dp`,
 * like the formatted number, which then carries no sign) are neutral.
 * Colours per tone live with the Pnl component in components/ui.tsx.
 */
export function plTone(value: NumLike, dp = 2): Tone {
  const d = toDec(value)
  if (!d || d.toDecimalPlaces(dp).isZero()) return 'neutral'
  return d.isNegative() ? 'negative' : 'positive'
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
