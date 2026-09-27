import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts'
import { Pnl } from '../../components/ui'
import { formatAxisDay, formatCompactFiat, formatDay, formatFiat, formatPct } from '../../lib/format'
import { useHistory } from '../../lib/queries'
import type { Currency, HistoryPoint, HistoryRange, PortfolioHistory } from '../../lib/types'
import {
  CARRIED_TIP,
  ChartCard,
  ChartFrame,
  EdgeAnchoredTick,
  ChartLegend,
  HistoryState,
  RangeSelector,
  TooltipBox,
  TooltipRow,
  type ChartSize,
  type TipProps,
} from './ChartParts'
import { pickTicks, plot, spanDays, tickCountFor, useChartColors, type ChartColors } from './chartUtils'

interface Row {
  date: string
  value: number | null
  cost: number | null
  point: HistoryPoint
}

/** Portfolio value (area) against cost basis (stepped line); the gap is unrealized P/L. */
export function ValueChart({ currency, size = 'full' }: { currency: Currency; size?: ChartSize }) {
  const [range, setRange] = useState<HistoryRange>('ALL')
  const history = useHistory(range, currency)
  return (
    <ChartCard
      id={`value-chart-${size}`}
      title="Value vs cost basis"
      description="The gap between the two lines is your unrealized profit or loss."
      controls={<RangeSelector name={`value-range-${size}`} value={range} onChange={setRange} />}
    >
      <HistoryState query={history} size={size}>
        {(h) => <ValuePlot history={h} size={size} />}
      </HistoryState>
    </ChartCard>
  )
}

function ValuePlot({ history, size }: { history: PortfolioHistory; size: ChartSize }) {
  const colors = useChartColors()
  const { currency } = history
  const data = useMemo<Row[]>(
    () => history.points.map((p) => ({ date: p.date, value: plot(p.currentValue), cost: plot(p.costBasis), point: p })),
    [history],
  )
  const span = spanDays(history.from ?? history.to, history.to)
  const dates = data.map((d) => d.date)

  return (
    <>
      <ChartLegend
        items={[
          { label: 'Value', color: colors.value, shape: 'area' },
          { label: 'Cost basis', color: colors.cost, shape: 'step' },
        ]}
      />
      <ChartFrame
        size={size}
        label={`Portfolio value and cost basis in ${currency} from ${formatDay(history.from)} to ${formatDay(history.to)}`}
      >
        {(width, height) => (
          <ComposedChart width={width} height={height} data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
              width={72}
              domain={[0, 'auto']}
              tickCount={5}
              tickFormatter={(v: number) => formatCompactFiat(v, currency)}
              tick={{ fontSize: 11, fill: colors.axis }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={(props: TipProps<Row>) => <ValueTooltip {...props} currency={currency} colors={colors} />}
              cursor={{ stroke: colors.cursor, strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke={colors.value}
              strokeWidth={2}
              fill={colors.value}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="cost"
              stroke={colors.cost}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        )}
      </ChartFrame>
    </>
  )
}

function ValueTooltip({ active, payload, currency, colors }: TipProps<Row> & { currency: Currency; colors: ChartColors }) {
  const p = active ? payload?.[0]?.payload?.point : undefined
  if (!p) return null
  return (
    <TooltipBox title={formatDay(p.date)} footer={p.priceSource === 'carried_forward' ? CARRIED_TIP : undefined}>
      <TooltipRow label="Value" color={colors.value} value={formatFiat(p.currentValue, currency)} />
      <TooltipRow label="Cost basis" color={colors.cost} value={formatFiat(p.costBasis, currency)} />
      <TooltipRow
        label="Unrealized P/L"
        value={
          <Pnl value={p.unrealizedPnl}>
            {formatFiat(p.unrealizedPnl, currency, { signed: true })}
            {p.unrealizedPnlPct !== null && ` (${formatPct(p.unrealizedPnlPct)})`}
          </Pnl>
        }
      />
    </TooltipBox>
  )
}
