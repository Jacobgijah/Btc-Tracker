import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { SegmentedControl } from '../../components/ui'
import { formatAxisDay, formatBTC, formatCompactBTC, formatCompactSats, formatDay, formatSats } from '../../lib/format'
import { satsToBtc } from '../../lib/money'
import { useHistory } from '../../lib/queries'
import type { Currency, HistoryPoint, HistoryRange, PortfolioHistory } from '../../lib/types'
import {
  ChartCard,
  ChartFrame,
  EdgeAnchoredTick,
  HistoryState,
  RangeSelector,
  TooltipBox,
  TooltipRow,
  type ChartSize,
  type TipProps,
} from './ChartParts'
import { pickTicks, plot, spanDays, tickCountFor, useChartColors } from './chartUtils'

type Unit = 'BTC' | 'SATS'

interface Row {
  date: string
  holdings: number | null
  point: HistoryPoint
}

/** BTC held over time (stepped: it only changes on transaction days). */
export function HoldingsChart({ currency, size = 'full' }: { currency: Currency; size?: ChartSize }) {
  const [range, setRange] = useState<HistoryRange>('ALL')
  const [unit, setUnit] = useState<Unit>('BTC')
  // Holdings don't depend on currency; asking in the display currency shares the cache with the other charts.
  const history = useHistory(range, currency)
  return (
    <ChartCard
      id={`holdings-chart-${size}`}
      title="Holdings over time"
      controls={
        <>
          <SegmentedControl<Unit>
            name={`holdings-unit-${size}`}
            label="Units"
            hideLabel
            size="sm"
            className="w-28"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'BTC', label: 'BTC' },
              { value: 'SATS', label: 'sats' },
            ]}
          />
          <RangeSelector name={`holdings-range-${size}`} value={range} onChange={setRange} />
        </>
      }
    >
      <HistoryState query={history} size={size}>
        {(h) => <HoldingsPlot history={h} unit={unit} size={size} />}
      </HistoryState>
    </ChartCard>
  )
}

function HoldingsPlot({ history, unit, size }: { history: PortfolioHistory; unit: Unit; size: ChartSize }) {
  const colors = useChartColors()
  const data = useMemo<Row[]>(
    () =>
      history.points.map((p) => ({
        date: p.date,
        holdings: plot(unit === 'BTC' ? satsToBtc(p.holdingsSats) : p.holdingsSats),
        point: p,
      })),
    [history, unit],
  )
  const span = spanDays(history.from ?? history.to, history.to)
  const dates = data.map((d) => d.date)

  return (
    <ChartFrame size={size} label={`Bitcoin held from ${formatDay(history.from)} to ${formatDay(history.to)}`}>
      {(width, height) => (
        <AreaChart width={width} height={height} data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={colors.grid} />
          <XAxis
            dataKey="date"
            ticks={pickTicks(dates, tickCountFor(width))}
            interval={0}
            tick={<EdgeAnchoredTick fill={colors.axis} format={(d) => formatAxisDay(d, span)} />}
            tickLine={false}
            axisLine={{ stroke: colors.grid }}
          />
          <YAxis
            width={unit === 'BTC' ? 76 : 70}
            domain={[0, 'auto']}
            tickCount={5}
            tickFormatter={(v: number) => (unit === 'BTC' ? formatCompactBTC(v) : formatCompactSats(v))}
            tick={{ fontSize: 11, fill: colors.axis }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={HoldingsTooltip} cursor={{ stroke: colors.cursor, strokeWidth: 1 }} isAnimationActive={false} />
          <Area
            type="stepAfter"
            dataKey="holdings"
            stroke={colors.value}
            strokeWidth={2}
            fill={colors.value}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      )}
    </ChartFrame>
  )
}

function HoldingsTooltip({ active, payload }: TipProps<Row>) {
  const p = active ? payload?.[0]?.payload?.point : undefined
  if (!p) return null
  return (
    <TooltipBox
      title={formatDay(p.date)}
      footer={p.transactionCount > 0 ? `${p.transactionCount} transaction${p.transactionCount === 1 ? '' : 's'} this day` : undefined}
    >
      <TooltipRow label="Holdings" value={formatBTC(satsToBtc(p.holdingsSats))} />
      <TooltipRow label="" value={formatSats(p.holdingsSats)} />
    </TooltipBox>
  )
}
