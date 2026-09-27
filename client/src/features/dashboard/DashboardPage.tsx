import { lazy, Suspense, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Info, PiggyBank, Plus } from 'lucide-react'
import { Card, ErrorState, LinkButton, PageHeader, Pnl, Skeleton, TypeBadge } from '../../components/ui'
import { api } from '../../lib/api'
import { formatBTC, formatDate, formatFiat, formatPct, formatSats, DASH } from '../../lib/format'
import { queryKeys, useDisplayCurrency, usePortfolio } from '../../lib/queries'
import type { Currency, CurrencyFigures, PortfolioSummary, Transaction } from '../../lib/types'
import { PriceCard } from './PriceCard'

// Recharts loads as its own chunk, after the numbers are on screen.
const DashboardCharts = lazy(() => import('../charts/ChartsPage').then((m) => ({ default: m.DashboardCharts })))

export function DashboardPage() {
  const currency = useDisplayCurrency()
  const portfolio = usePortfolio()

  return (
    <>
      <PageHeader title="Dashboard" />
      {portfolio.isPending ? (
        <DashboardSkeleton />
      ) : portfolio.isError ? (
        <ErrorState
          title="Couldn't load your portfolio"
          error={portfolio.error}
          onRetry={() => portfolio.refetch()}
        />
      ) : portfolio.data.transactionCount === 0 ? (
        <div className="space-y-4">
          <EmptyState />
          <PriceCard price={portfolio.data.price} />
        </div>
      ) : (
        <div className="space-y-4">
          <Headline summary={portfolio.data} currency={currency} />
          <Stats summary={portfolio.data} currency={currency} />
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <DashboardCharts summary={portfolio.data} currency={currency} />
          </Suspense>
          <div className="grid gap-4 lg:grid-cols-2">
            <PriceCard price={portfolio.data.price} />
            <RecentTransactions />
          </div>
        </div>
      )}
    </>
  )
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-btc/15 text-btc-700 dark:text-btc">
        <PiggyBank className="size-7" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold">Start tracking your savings</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
        Record a bitcoin purchase and you'll see its value and profit/loss here in TZS and USD.
      </p>
      <LinkButton to="/transactions/new" variant="primary" className="mt-6 w-full max-w-xs">
        <Plus className="size-4" aria-hidden />
        Add your first purchase
      </LinkButton>
    </Card>
  )
}

function Headline({ summary, currency }: { summary: PortfolioSummary; currency: Currency }) {
  const f = summary[currency]
  const noPrice = summary.price === null
  return (
    <Card aria-labelledby="value-heading">
      <h2 id="value-heading" className="text-sm font-medium text-slate-600 dark:text-slate-400">
        Current value
      </h2>
      <p className="tabular mt-1 text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
        {formatFiat(f.currentValue, currency)}
      </p>
      <p className="tabular mt-1 text-sm text-slate-600 dark:text-slate-400">{formatBTC(summary.holdings.btc)}</p>

      {noPrice ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          There's no BTC price yet, so value and profit/loss can't be calculated. Refresh the price below.
        </p>
      ) : (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Unrealized profit/loss</p>
          <p className="tabular mt-0.5 flex flex-wrap items-baseline gap-x-3 text-xl font-semibold">
            <Pnl value={f.unrealizedPnl}>{formatFiat(f.unrealizedPnl, currency, { signed: true })}</Pnl>
            <Pnl value={f.unrealizedPnlPct} className="text-base">
              {f.unrealizedPnlPct === null ? DASH : `(${formatPct(f.unrealizedPnlPct)})`}
            </Pnl>
          </p>
        </div>
      )}
    </Card>
  )
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <dt className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className="tabular mt-1 text-base font-semibold break-words sm:text-lg">{value}</dd>
      {sub && <dd className="tabular mt-0.5 text-xs text-slate-600 dark:text-slate-400">{sub}</dd>}
    </div>
  )
}

function Stats({ summary, currency }: { summary: PortfolioSummary; currency: Currency }) {
  const f: CurrencyFigures = summary[currency]
  const money = (v: string | null) => formatFiat(v, currency)
  const signed = (v: string | null) => <Pnl value={v}>{formatFiat(v, currency, { signed: true })}</Pnl>
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Stat label="Holdings" value={formatBTC(summary.holdings.btc)} sub={formatSats(summary.holdings.sats)} />
      <Stat label="Total invested" value={money(f.invested)} sub="All buys and transfers in, incl. fees" />
      <Stat label="Cost basis" value={money(f.costBasis)} sub="Cost of the BTC you still hold" />
      <Stat
        label="Average cost per BTC"
        value={money(f.avgCostPerBtc)}
        sub={f.avgCostPerBtc === null ? 'No BTC held' : undefined}
      />
      <Stat label="Realized P/L" value={signed(f.realizedPnl)} sub="From sells" />
      <Stat
        label="Total P/L"
        value={signed(f.totalPnl)}
        sub={f.totalPnl === null ? 'Needs a BTC price' : 'Realized + unrealized'}
      />
    </dl>
  )
}

function RecentTransactions() {
  const filters = { page: 1, pageSize: 5 }
  const recent = useQuery({
    queryKey: queryKeys.transactionList(filters),
    queryFn: () => api.listTransactions(filters),
  })

  return (
    <Card aria-labelledby="recent-heading">
      <div className="flex items-center justify-between">
        <h2 id="recent-heading" className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Recent transactions
        </h2>
        <Link
          to="/transactions"
          className="-mr-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-btc-700 hover:underline dark:text-btc"
        >
          View all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {recent.isPending ? (
        <div className="mt-2 space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : recent.isError ? (
        <ErrorState className="mt-2" error={recent.error} onRetry={() => recent.refetch()} />
      ) : (
        <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
          {recent.data.data.map((t) => (
            <RecentRow key={t.id} t={t} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function RecentRow({ t }: { t: Transaction }) {
  return (
    <li>
      <Link
        to={`/transactions/${t.id}/edit`}
        className="-mx-2 flex min-h-14 items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <div className="flex flex-col items-start gap-1">
          <TypeBadge type={t.type} />
          <span className="text-xs text-slate-600 dark:text-slate-400">{formatDate(t.date)}</span>
        </div>
        <div className="tabular text-right">
          <p className="text-sm font-semibold">{formatBTC(t.btc)}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{formatFiat(t.fiatAmount, t.fiatCurrency)}</p>
        </div>
      </Link>
    </li>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-10 w-56" />
        <Skeleton className="mt-2 h-4 w-32" />
        <Skeleton className="mt-5 h-6 w-44" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-28" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-6 w-full" />
      </div>
    </div>
  )
}
