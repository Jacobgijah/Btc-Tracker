import { Card, Pnl } from '../../components/ui'
import { formatTZS } from '../../lib/format'
import type { Currency, PortfolioSummary } from '../../lib/types'

/**
 * TZS view only: splits unrealized P/L into what bitcoin's dollar price did and
 * what the shilling's move against the dollar did. The two always add up.
 */
export function FxEffectCard({ summary, currency }: { summary: PortfolioSummary; currency: Currency }) {
  if (currency !== 'TZS' || summary.transactionCount === 0) return null
  const { btcEffect, fxEffect, unrealizedPnl } = summary.TZS
  const signed = (v: string | null | undefined) => (
    <Pnl value={v ?? null}>{formatTZS(v ?? null, { signed: true })}</Pnl>
  )

  return (
    <Card aria-labelledby="fx-effect-heading">
      <h2 id="fx-effect-heading" className="text-base font-semibold text-slate-950 dark:text-white">
        Where your shilling profit comes from
      </h2>
      {btcEffect === null || btcEffect === undefined ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Needs a BTC price. Refresh the price to see the split.</p>
      ) : (
        <>
          <dl className="tabular mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-600 dark:text-slate-400">From BTC price</dt>
              <dd className="text-lg font-semibold">{signed(btcEffect)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600 dark:text-slate-400">From shilling vs dollar</dt>
              <dd className="text-lg font-semibold">{signed(fxEffect)}</dd>
            </div>
            <div className="border-t border-slate-100 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4 dark:border-slate-800">
              <dt className="text-xs text-slate-600 dark:text-slate-400">Unrealized P/L (total)</dt>
              <dd className="text-lg font-semibold">{signed(unrealizedPnl)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
            "Shilling vs dollar" is what you'd have gained or lost in TSh if bitcoin's dollar price hadn't moved since
            you bought, just from the shilling weakening or strengthening against the dollar.
          </p>
        </>
      )}
    </Card>
  )
}
