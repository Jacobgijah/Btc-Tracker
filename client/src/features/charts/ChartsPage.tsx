import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '../../components/ui'
import { useDisplayCurrency, usePortfolio } from '../../lib/queries'
import type { Currency, PortfolioSummary } from '../../lib/types'
import { FxEffectCard } from './FxEffectCard'
import { HoldingsChart } from './HoldingsChart'
import { MonthlyChart } from './MonthlyChart'
import { PriceChart } from './PriceChart'
import { ValueChart } from './ValueChart'

/** /charts: every chart, full size. */
export function ChartsPage() {
  const currency = useDisplayCurrency()
  const portfolio = usePortfolio()
  return (
    <>
      <PageHeader title="Charts" />
      <div className="space-y-4">
        {portfolio.data && <FxEffectCard summary={portfolio.data} currency={currency} />}
        <ValueChart currency={currency} />
        <PriceChart currency={currency} />
        <HoldingsChart currency={currency} />
        <MonthlyChart currency={currency} />
      </div>
    </>
  )
}

/** Dashboard section: the FX split and the two main charts, compact, with a link to the rest. */
export function DashboardCharts({ summary, currency }: { summary: PortfolioSummary; currency: Currency }) {
  return (
    <section aria-labelledby="charts-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="charts-heading" className="text-lg font-semibold text-text">
          Charts
        </h2>
        <Link
          to="/charts"
          className="-mr-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-text underline decoration-info decoration-2 underline-offset-4 hover:decoration-accent"
        >
          All charts <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <FxEffectCard summary={summary} currency={currency} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ValueChart currency={currency} size="compact" />
        <PriceChart currency={currency} size="compact" />
      </div>
    </section>
  )
}
