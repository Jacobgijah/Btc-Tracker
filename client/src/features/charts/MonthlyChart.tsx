import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState } from '../../components/ui'
import {
  formatBTC,
  formatCompactFiat,
  formatCompactSats,
  formatFiat,
  formatMonth,
  formatSats,
} from '../../lib/format'
import { satsToBtc } from '../../lib/money'
import { useMonthly } from '../../lib/queries'
import type { Currency, HistoryRange, MonthlyReport, MonthlyRow } from '../../lib/types'
import {
  ChartCard,
  ChartEmpty,
  ChartSkeleton,
  EdgeAnchoredTick,
  LegendKey,
  EMPTY_HISTORY_MESSAGE,
  RangeSelector,
  TooltipBox,
  TooltipRow,
  type ChartSize,
  type TipProps,
} from './ChartParts'
import { plot, tickCountFor, CHART, useElementWidth, chartHeight, type ChartColors } from './chartUtils'

const MONTHS_IN_RANGE: Record<HistoryRange, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, ALL: Infinity }

interface Row {
  month: string
  invested: number | null
  sats: number | null
  row: MonthlyRow
}

/**
 * Fiat invested per month (gold bars) with sats acquired (blue line) in a second panel
 * that shares the month axis. Two aligned panels rather than one chart with two y-axes, so
 * each measure keeps an honest scale.
 */
export function MonthlyChart({ currency, size = 'full' }: { currency: Currency; size?: ChartSize }) {
  const [range, setRange] = useState<HistoryRange>('1Y')
  const monthly = useMonthly(currency)

  let body
  if (monthly.isPending) body = <ChartSkeleton size={size} />
  else if (monthly.isError) {
    body = <ErrorState title="Couldn't load this chart" error={monthly.error} onRetry={() => monthly.refetch()} />
  } else if (monthly.data.months.length === 0) body = <ChartEmpty size={size} message={EMPTY_HISTORY_MESSAGE} />
  else body = <MonthlyPlot report={monthly.data} range={range} size={size} />

  return (
    <ChartCard
      id={`monthly-chart-${size}`}
      title="Monthly savings"
      description={monthly.data && monthly.data.months.length > 0 ? <SavingsSummary report={monthly.data} /> : undefined}
      controls={<RangeSelector name={`monthly-range-${size}`} value={range} onChange={setRange} />}
    >
      {body}
    </ChartCard>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "Saved in 7 months · TSh 850,000 a month on average · current streak: 3 months" */
function SavingsSummary({ report }: { report: MonthlyReport }) {
  const { monthsSaved, averagePerMonth, currentStreak } = report.summary
  return (
    <span>
      Saved in {plural(monthsSaved, 'month')}
      {averagePerMonth !== null && <> · {formatFiat(averagePerMonth, report.currency)} a month on average</>} ·{' '}
      {currentStreak > 0 ? `current streak: ${plural(currentStreak, 'month')}` : 'no current streak'}
    </span>
  )
}

function MonthlyPlot({ report, range, size }: { report: MonthlyReport; range: HistoryRange; size: ChartSize }) {
  const colors = CHART
  const { currency } = report
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const data = useMemo<Row[]>(
    () =>
      report.months
        .slice(-Math.min(MONTHS_IN_RANGE[range], report.months.length))
        .map((m) => ({ month: m.month, invested: plot(m.invested), sats: plot(m.satsAcquired), row: m })),
    [report, range],
  )
  const total = chartHeight(width, size)
  const topHeight = Math.round(total * 0.58)
  const bottomHeight = total - topHeight + 24
  // Every k-th month counting back from the latest, so labels are regularly spaced
  // (picking "n evenly" from 12 months skips irregular ones and looks like a gap).
  const fit = tickCountFor(width, 2, 12) - (width < 480 ? 1 : 0)
  const step = Math.ceil(data.length / fit)
  const ticks = data.map((d) => d.month).filter((_, i) => (data.length - 1 - i) % step === 0)
  // "Oct 2025, Nov, Dec, Jan 2026, Feb": the year only where it starts or changes.
  const monthLabel = (m: string, index: number) => formatMonth(m, { short: index > 0 && !m.endsWith('-01') })
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="month"
      hide={hide}
      // Band scale in both panels, so the line's points sit over the bars' centres.
      scale="band"
      ticks={ticks}
      interval={0}
      tick={<EdgeAnchoredTick fill={colors.axis} format={monthLabel} />}
      tickLine={false}
      axisLine={{ stroke: colors.grid, strokeOpacity: 0.5 }}
    />
  )
  const yTick = { fontSize: 11, fill: colors.axis }
  const barProps = { radius: [4, 4, 0, 0] as [number, number, number, number], maxBarSize: 24, isAnimationActive: false }

  return (
    <div ref={ref} className="w-full select-none" style={{ minHeight: total }}>
      {width > 0 && (
        <>
          <p className="flex items-center gap-1.5 text-xs font-medium text-text">
            <LegendKey shape="bar" color={colors.invested} />
            Invested ({currency}, incl. fees)
          </p>
          <div role="img" aria-label={`Money invested per month in ${currency}`}>
            <BarChart width={width} height={topHeight} data={data} syncId="monthly" margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={colors.grid} strokeOpacity={colors.gridOpacity} />
              {xAxis(true)}
              <YAxis
                width={72}
                tickCount={4}
                tickFormatter={(v: number) => formatCompactFiat(v, currency)}
                tick={yTick}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={(props: TipProps<Row>) => <MonthTooltip {...props} currency={currency} colors={colors} />}
                cursor={{ fill: colors.grid, fillOpacity: 0.12 }}
                isAnimationActive={false}
              />
              <Bar dataKey="invested" fill={colors.invested} {...barProps} />
            </BarChart>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-text">
            <LegendKey shape="line" color={colors.sats} />
            Sats acquired
          </p>
          <div role="img" aria-label="Sats acquired per month">
            <ComposedChart width={width} height={bottomHeight} data={data} syncId="monthly" margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={colors.grid} strokeOpacity={colors.gridOpacity} />
              {xAxis(false)}
              <YAxis
                width={72}
                tickCount={3}
                tickFormatter={(v: number) => formatCompactSats(v).replace(' sats', '')}
                tick={yTick}
                tickLine={false}
                axisLine={false}
              />
              {/* Synced with the panel above, which shows the tooltip. */}
              <Tooltip content={() => null} cursor={{ fill: colors.grid, fillOpacity: 0.12 }} isAnimationActive={false} />
              <Line
                type="linear"
                dataKey="sats"
                stroke={colors.sats}
                strokeWidth={2}
                dot={{ r: 3, fill: colors.sats, stroke: colors.surface, strokeWidth: 1 }}
                activeDot={{ r: 5, fill: colors.sats, stroke: colors.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </div>
        </>
      )}
    </div>
  )
}

function MonthTooltip({ active, payload, currency, colors }: TipProps<Row> & { currency: Currency; colors: ChartColors }) {
  const m = active ? payload?.[0]?.payload?.row : undefined
  if (!m) return null
  return (
    <TooltipBox
      title={formatMonth(m.month)}
      footer={
        m.sellCount > 0
          ? `Sold ${formatBTC(satsToBtc(m.satsSold))} for ${formatFiat(m.received, currency)} (${plural(m.sellCount, 'sell')})`
          : undefined
      }
    >
      <TooltipRow label="Invested" color={colors.invested} value={formatFiat(m.invested, currency)} />
      <TooltipRow label="Sats acquired" color={colors.sats} value={formatSats(m.satsAcquired)} />
      <TooltipRow label="Buys" value={m.buyCount + (m.transferInCount ? ` (+${m.transferInCount} transfer in)` : '')} />
      <TooltipRow label="Avg buy price" value={formatFiat(m.avgBuyPrice, currency)} />
    </TooltipBox>
  )
}
