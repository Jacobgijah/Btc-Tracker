import { z } from 'zod'
import { BTC_PATTERN, D, MAX_SATS, SATS_PATTERN, amountToSats, satsToBtcInput } from '../../lib/money'
import { CURRENCIES, TRANSACTION_TYPES } from '../../lib/types'
import type { Currency, Transaction, TransactionInput, TransactionType } from '../../lib/types'

// Mirrors server/src/schemas/transaction.schema.js so most mistakes are caught
// before a request is made. The server stays the source of truth.

export type AmountUnit = 'BTC' | 'SATS'

export interface TransactionFormValues {
  type: TransactionType
  /** datetime-local value in the browser's timezone: "2026-01-10T14:30" */
  date: string
  amountUnit: AmountUnit
  amount: string
  fiatCurrency: Currency
  fiatAmount: string
  feeAmount: string
  usdTzsRate: string
  exchange: string
  note: string
}

// Same allowance for clock skew as the server.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

const DECIMAL = /^\d+(\.\d+)?$/

function checkDecimal(
  value: string,
  ctx: z.RefinementCtx,
  path: keyof TransactionFormValues,
  { label, dp, intDigits, allowZero }: { label: string; dp: number; intDigits: number; allowZero: boolean },
): boolean {
  const str = value.trim()
  const issue = (message: string) => {
    ctx.addIssue({ code: 'custom', path: [path], message })
    return false
  }
  if (str === '') return issue(`Enter ${label}`)
  if (str.startsWith('-')) return issue(`${capitalize(label)} can't be negative`)
  if (!DECIMAL.test(str)) return issue('Enter a plain number, e.g. 1500.50 (no commas)')
  const [int, frac = ''] = str.split('.')
  if (frac.length > dp) return issue(`Use at most ${dp} decimal places`)
  if (int.replace(/^0+(?=\d)/, '').length > intDigits) return issue(`${capitalize(label)} is too large`)
  if (!allowZero && new D(str).isZero()) return issue(`${capitalize(label)} must be greater than 0`)
  return true
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** datetime-local string -> Date, or null if invalid. */
export function parseLocalDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(value)) return null
  const d = new Date(value) // no offset: parsed as local time
  return Number.isNaN(d.getTime()) ? null : d
}

/** Date -> datetime-local value in the browser's timezone, minute precision. */
export function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

export function buildTransactionSchema(now: () => number = Date.now) {
  return z
    .object({
      type: z.enum(TRANSACTION_TYPES as [TransactionType, ...TransactionType[]]),
      date: z.string(),
      amountUnit: z.enum(['BTC', 'SATS']),
      amount: z.string(),
      fiatCurrency: z.enum(CURRENCIES as [Currency, ...Currency[]]),
      fiatAmount: z.string(),
      feeAmount: z.string(),
      usdTzsRate: z.string(),
      exchange: z.string().trim().max(100, 'Use at most 100 characters'),
      note: z.string().trim().max(500, 'Use at most 500 characters'),
    })
    .superRefine((v, ctx) => {
      // Date: valid and not in the future.
      const date = parseLocalDateTime(v.date)
      if (!date) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Enter a valid date and time' })
      } else if (date.getTime() > now() + FUTURE_TOLERANCE_MS) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: "Date can't be in the future" })
      }

      // BTC amount: ≤ 8 dp as BTC, whole number as sats, > 0, ≤ 21M BTC.
      const amount = v.amount.trim()
      const unitOk = v.amountUnit === 'BTC' ? BTC_PATTERN.test(amount) : SATS_PATTERN.test(amount)
      if (amount === '') {
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter the amount of bitcoin' })
      } else if (!unitOk) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message:
            v.amountUnit === 'BTC'
              ? 'Enter BTC with at most 8 decimal places, e.g. 0.0125'
              : 'Enter a whole number of sats, e.g. 1250000',
        })
      } else {
        const sats = amountToSats(amount, v.amountUnit)!
        if (sats <= 0n) {
          ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount must be greater than 0' })
        } else if (sats > MAX_SATS) {
          ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount exceeds the 21M BTC supply' })
        }
      }

      // Fiat amount: 2 dp; > 0 except for TRANSFER_IN (0 = zero cost basis).
      const fiatOk = checkDecimal(v.fiatAmount, ctx, 'fiatAmount', {
        label: v.type === 'SELL' ? 'the amount received' : 'the amount',
        dp: 2,
        intDigits: 18,
        allowZero: v.type === 'TRANSFER_IN',
      })

      // Fee: optional (empty = 0), 2 dp; must be below the amount on a SELL.
      const fee = v.feeAmount.trim() === '' ? '0' : v.feeAmount
      const feeOk = checkDecimal(fee, ctx, 'feeAmount', { label: 'the fee', dp: 2, intDigits: 18, allowZero: true })
      if (fiatOk && feeOk && v.type === 'SELL' && new D(fee.trim()).gte(v.fiatAmount.trim())) {
        ctx.addIssue({
          code: 'custom',
          path: ['feeAmount'],
          message: 'On a sell the fee must be less than the amount received',
        })
      }

      // USD/TZS rate: > 0, 4 dp.
      checkDecimal(v.usdTzsRate, ctx, 'usdTzsRate', {
        label: 'the USD/TZS rate',
        dp: 4,
        intDigits: 10,
        allowZero: false,
      })
    })
}

export const transactionSchema = buildTransactionSchema()

export function defaultFormValues(now: Date = new Date()): TransactionFormValues {
  return {
    type: 'BUY',
    date: toLocalDateTimeInput(now),
    amountUnit: 'BTC',
    amount: '',
    fiatCurrency: 'TZS',
    fiatAmount: '',
    feeAmount: '',
    usdTzsRate: '',
    exchange: '',
    note: '',
  }
}

/** Strips trailing zeros the API adds ("2500000.00" -> "2500000") for friendlier inputs. */
function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

export function formValuesFromTransaction(t: Transaction): TransactionFormValues {
  return {
    type: t.type,
    date: toLocalDateTimeInput(new Date(t.date)),
    amountUnit: 'BTC',
    amount: satsToBtcInput(t.sats),
    fiatCurrency: t.fiatCurrency,
    fiatAmount: trimZeros(t.fiatAmount),
    feeAmount: trimZeros(t.feeAmount),
    usdTzsRate: trimZeros(t.usdTzsRate),
    exchange: t.exchange ?? '',
    note: t.note ?? '',
  }
}

/**
 * Builds the API body. When editing and the date input wasn't changed, the
 * original timestamp is kept (the input only has minute precision).
 */
export function toTransactionInput(v: TransactionFormValues, original?: Transaction): TransactionInput {
  const unchangedDate = original && toLocalDateTimeInput(new Date(original.date)) === v.date
  const amount = v.amount.trim()
  return {
    type: v.type,
    date: unchangedDate ? original.date : parseLocalDateTime(v.date)!.toISOString(),
    ...(v.amountUnit === 'BTC' ? { btc: amount } : { sats: amount }),
    fiatAmount: v.fiatAmount.trim(),
    feeAmount: v.feeAmount.trim() === '' ? '0' : v.feeAmount.trim(),
    fiatCurrency: v.fiatCurrency,
    usdTzsRate: v.usdTzsRate.trim(),
    exchange: v.exchange.trim() || null,
    note: v.note.trim() || null,
  }
}

/** Server field name -> form field name. */
export function formFieldForServerField(field: string): keyof TransactionFormValues | null {
  if (field === 'btc' || field === 'sats') return 'amount'
  const known: (keyof TransactionFormValues)[] = [
    'type',
    'date',
    'fiatCurrency',
    'fiatAmount',
    'feeAmount',
    'usdTzsRate',
    'exchange',
    'note',
  ]
  return (known as string[]).includes(field) ? (field as keyof TransactionFormValues) : null
}
