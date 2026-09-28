import { convert, pricePerBtc } from '../../lib/calc'
import { DASH, formatBTC, formatFiat, formatSats } from '../../lib/format'
import { D, amountToSats, parseDec, satsToBtc } from '../../lib/money'
import type { Currency } from '../../lib/types'
import type { TransactionFormValues } from './transactionSchema'

const OTHER: Record<Currency, Currency> = { TZS: 'USD', USD: 'TZS' }

/** Live preview of what the form describes, computed with decimal.js. */
export function TransactionPreview({ values }: { values: Partial<TransactionFormValues> }) {
  const unit = values.amountUnit ?? 'BTC'
  const currency = values.fiatCurrency ?? 'TZS'
  const other = OTHER[currency]
  const sats = amountToSats(values.amount ?? '', unit)
  const fiat = parseDec(values.fiatAmount)
  const fee = values.feeAmount?.trim() ? parseDec(values.feeAmount) : new D(0)
  const rateRaw = parseDec(values.usdTzsRate)
  const rate = rateRaw && rateRaw.gt(0) ? rateRaw : null
  const isSell = values.type === 'SELL'

  const price = fiat && sats && sats > 0n ? pricePerBtc(fiat, sats) : null
  const total = fiat && fee ? (isSell ? fiat.minus(fee) : fiat.plus(fee)) : null

  const both = (value: typeof price) => ({
    own: value ? formatFiat(value, currency) : DASH,
    other: value && rate ? formatFiat(convert(value, currency, other, rate), other) : DASH,
  })
  const p = both(price)
  const t = both(total)

  return (
    <section
      aria-labelledby="preview-heading"
      aria-live="polite"
      className="rounded-2xl border border-dashed border-border-strong bg-bg p-4"
    >
      <h2 id="preview-heading" className="text-sm font-semibold text-text">
        Preview
      </h2>
      <dl className="tabular mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-text-muted">Bitcoin</dt>
          <dd className="font-semibold">{sats && sats > 0n ? formatBTC(satsToBtc(sats)) : DASH}</dd>
          <dd className="text-xs text-text-muted">
            {sats && sats > 0n ? formatSats(sats.toString()) : ''}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Price per BTC</dt>
          <dd className="font-semibold">{p.own}</dd>
          <dd className="text-xs text-text-muted">{p.other}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">
            {isSell ? 'You receive (after fee)' : 'Total cost (incl. fee)'}
          </dt>
          <dd className="font-semibold">{t.own}</dd>
          <dd className="text-xs text-text-muted">{t.other}</dd>
        </div>
      </dl>
    </section>
  )
}
