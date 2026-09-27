import { describe, expect, it } from 'vitest'
import {
  buildTransactionSchema,
  toLocalDateTimeInput,
  toTransactionInput,
  type TransactionFormValues,
} from './transactionSchema'
import { buyTx } from '../../test/utils'

const NOW = new Date('2026-09-27T12:00:00Z')
const schema = buildTransactionSchema(() => NOW.getTime())

const valid: TransactionFormValues = {
  type: 'BUY',
  date: toLocalDateTimeInput(new Date('2026-01-10T10:00:00Z')),
  amountUnit: 'BTC',
  amount: '0.01',
  fiatCurrency: 'TZS',
  fiatAmount: '2500000',
  feeAmount: '25000',
  usdTzsRate: '2500',
  exchange: 'Binance',
  note: '',
}

/** Field -> first error message. */
function errorsFor(values: Partial<TransactionFormValues>): Record<string, string> {
  const result = schema.safeParse({ ...valid, ...values })
  if (result.success) return {}
  const out: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_')
    out[key] ??= issue.message
  }
  return out
}

describe('transaction form validation', () => {
  it('accepts a valid buy', () => {
    expect(errorsFor({})).toEqual({})
  })

  it('limits BTC to 8 decimal places and sats to whole numbers', () => {
    expect(errorsFor({ amount: '0.123456789' }).amount).toMatch(/8 decimal places/)
    expect(errorsFor({ amount: '0.12345678' })).toEqual({})
    expect(errorsFor({ amountUnit: 'SATS', amount: '1.5' }).amount).toMatch(/whole number/)
    expect(errorsFor({ amountUnit: 'SATS', amount: '1250000' })).toEqual({})
  })

  it('requires a positive BTC amount within the 21M supply', () => {
    expect(errorsFor({ amount: '' }).amount).toMatch(/Enter the amount/)
    expect(errorsFor({ amount: '0' }).amount).toMatch(/greater than 0/)
    expect(errorsFor({ amountUnit: 'SATS', amount: '0' }).amount).toMatch(/greater than 0/)
    expect(errorsFor({ amount: '21000001' }).amount).toMatch(/21M/)
    expect(errorsFor({ amount: '-1' }).amount).toBeDefined()
  })

  it('limits fiat amounts and fees to 2 decimal places', () => {
    expect(errorsFor({ fiatAmount: '100.123' }).fiatAmount).toMatch(/2 decimal places/)
    expect(errorsFor({ feeAmount: '1.001' }).feeAmount).toMatch(/2 decimal places/)
    expect(errorsFor({ fiatAmount: '1,000' }).fiatAmount).toMatch(/plain number/)
    expect(errorsFor({ fiatAmount: '-5' }).fiatAmount).toMatch(/negative/)
  })

  it('requires fiat > 0 for buys and sells but allows 0 for transfers in', () => {
    expect(errorsFor({ fiatAmount: '0' }).fiatAmount).toMatch(/greater than 0/)
    expect(errorsFor({ type: 'SELL', fiatAmount: '0', feeAmount: '' }).fiatAmount).toMatch(/greater than 0/)
    expect(errorsFor({ type: 'TRANSFER_IN', fiatAmount: '0', feeAmount: '' })).toEqual({})
  })

  it('treats an empty fee as 0', () => {
    expect(errorsFor({ feeAmount: '' })).toEqual({})
  })

  it('requires the fee to be less than the amount on a sell', () => {
    expect(errorsFor({ type: 'SELL', fiatAmount: '330', feeAmount: '330' }).feeAmount).toMatch(/less than/)
    expect(errorsFor({ type: 'SELL', fiatAmount: '330', feeAmount: '400' }).feeAmount).toMatch(/less than/)
    expect(errorsFor({ type: 'SELL', fiatAmount: '330', feeAmount: '3' })).toEqual({})
    // not a rule for buys
    expect(errorsFor({ type: 'BUY', fiatAmount: '330', feeAmount: '400' })).toEqual({})
  })

  it('rejects future dates (beyond a 5-minute clock-skew allowance) and invalid dates', () => {
    const in10min = toLocalDateTimeInput(new Date(NOW.getTime() + 10 * 60_000))
    const in2min = toLocalDateTimeInput(new Date(NOW.getTime() + 2 * 60_000))
    expect(errorsFor({ date: in10min }).date).toMatch(/future/)
    expect(errorsFor({ date: in2min })).toEqual({})
    expect(errorsFor({ date: '' }).date).toMatch(/valid date/)
    expect(errorsFor({ date: '2026-13-45T10:00' }).date).toMatch(/valid date/)
  })

  it('requires a positive USD/TZS rate with at most 4 decimal places', () => {
    expect(errorsFor({ usdTzsRate: '' }).usdTzsRate).toMatch(/Enter the USD\/TZS rate/)
    expect(errorsFor({ usdTzsRate: '0' }).usdTzsRate).toMatch(/greater than 0/)
    expect(errorsFor({ usdTzsRate: '2500.12345' }).usdTzsRate).toMatch(/4 decimal places/)
    expect(errorsFor({ usdTzsRate: '2500.1234' })).toEqual({})
  })

  it('limits exchange and note length', () => {
    expect(errorsFor({ exchange: 'x'.repeat(101) }).exchange).toMatch(/100/)
    expect(errorsFor({ note: 'x'.repeat(501) }).note).toMatch(/500/)
  })
})

describe('toTransactionInput', () => {
  it('builds the API body with btc or sats and nulls for empty text', () => {
    const body = toTransactionInput({ ...valid, feeAmount: '', exchange: ' ' })
    expect(body).toMatchObject({
      type: 'BUY',
      btc: '0.01',
      fiatAmount: '2500000',
      feeAmount: '0',
      usdTzsRate: '2500',
      exchange: null,
      note: null,
    })
    expect(body.date).toBe('2026-01-10T10:00:00.000Z')
    expect(toTransactionInput({ ...valid, amountUnit: 'SATS', amount: '1000000' })).toMatchObject({ sats: '1000000' })
  })

  it('keeps the original timestamp when an edit leaves the date alone', () => {
    const original = { ...buyTx, date: '2026-01-10T10:00:42.123Z' }
    const body = toTransactionInput({ ...valid, date: toLocalDateTimeInput(new Date(original.date)) }, original)
    expect(body.date).toBe('2026-01-10T10:00:42.123Z')
  })
})
