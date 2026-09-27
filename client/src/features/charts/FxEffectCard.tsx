import { Card, Pnl } from '../../components/ui'
import { formatTZS } from '../../lib/format'
import type { Currency, PortfolioSummary } from '../../lib/types'
import { LegendKey } from './ChartParts'
import { CHART } from './chartUtils'

// The two parts keep the charts' colour roles: gold = BTC price, blue = the shilling vs the dollar.
const BTC_PART = CHART.value
const FX_PART = CHART.price

/**
 * TZS view only: splits unrealized P/L into what bitcoin's dollar price did and
 * what the shilling's move against the dollar did. The two always add up.
 */
export function FxEffectCard({ summary, currency }: { summary: PortfolioSummary; currency: Currency }) {
  if (currency !== 'TZS' || summary.transactionCount === 0) return null
  const { btcEffect, fxEffect, unrealizedPnl } = summary.TZS
  // 18px values: "small" text, so a loss is white with a blue ▼ (Pnl handles it).
  const signed = (v: string | null | undefined) => <Pnl value={v ?? null}>{formatTZS(v ?? null, { signed: true })}</Pnl>

  return (
    <Card aria-labelledby="fx-effect-heading">
      <h2 id="fx-effect-heading" className="text-base font-semibold text-text">
        Where your shilling profit comes from
      </h2>
      {btcEffect === null || btcEffect === undefined ? (
        <p className="mt-2 text-sm text-text-muted">Needs a BTC price. Refresh the price to see the split.</p>
      ) : (
        <>
          <dl className="tabular mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="border-l-4 pl-3" style={{ borderColor: BTC_PART }}>
              <dt className="flex items-center gap-1.5 text-xs text-text">
                <LegendKey shape="bar" color={BTC_PART} />
                From BTC price
              </dt>
              <dd className="text-lg font-semibold">{signed(btcEffect)}</dd>
            </div>
            <div className="border-l-4 pl-3" style={{ borderColor: FX_PART }}>
              <dt className="flex items-center gap-1.5 text-xs text-text">
                <LegendKey shape="bar" color={FX_PART} />
                From shilling vs dollar
              </dt>
              <dd className="text-lg font-semibold">{signed(fxEffect)}</dd>
            </div>
            <div className="border-t border-border pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
              <dt className="text-xs text-text-muted">Unrealized P/L (total)</dt>
              <dd className="text-lg font-semibold">{signed(unrealizedPnl)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-text-muted">
            "Shilling vs dollar" is what you'd have gained or lost in TSh if bitcoin's dollar price hadn't moved since
            you bought, just from the shilling weakening or strengthening against the dollar.
          </p>
        </>
      )}
    </Card>
  )
}
