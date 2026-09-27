import { useMemo, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { impliedPrice } from '../../lib/calc'
import {
  TYPE_LABELS,
  formatAxisDay,
  formatBTC,
  formatCompactFiat,
  formatDay,
  formatFiat,
} from '../../lib/format'
import { useHistory, useLedger } from '../../lib/queries'
import type { Currency, HistoryPoint, HistoryRange, LedgerRow, PortfolioHistory } from '../../lib/types'
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
  TrianglePath,
  type ChartSize,
  type TipProps,
} from './ChartParts'
import { pickTicks, plot, spanDays, tickCountFor, CHART, type ChartColors } from './chartUtils'

interface Row {
  date: string
  price: number | null
  avg: number | null
  buy: number | null
  sell: number | null
  point: HistoryPoint
  txs: LedgerRow[]
}

/** BTC price against your average cost, with a marker at every buy and sell. */
export function PriceChart({ currency, size = 'full' }: { currency: Currency; size?: ChartSize }) {
  const [range, setRange] = useState<HistoryRange>('ALL')
  const history = useHistory(range, currency)
  const ledger = useLedger()
  return (
    <ChartCard
      id={`price-chart-${size}`}
      title="BTC price vs your average cost"
      description="Above your average cost, the coins you hold are in profit."
      controls={<RangeSelector name={`price-range-${size}`} value={range} onChange={setRange} />}
    >
      <HistoryState query={history} size={size}>
        {(h) => <PricePlot history={h} ledger={ledger.data ?? []} size={size} />}
      </HistoryState>
    </ChartCard>
  )
}

/** Where a trade's marker sits: the market price that day (on the price line), else the chart's price. */
function markerPrice(row: LedgerRow | undefined, currency: Currency, point: HistoryPoint): number | null {
  if (!row) return null
  const market = row.marketPrice && (currency === 'USD' ? row.marketPrice.btcUsd : row.marketPrice.btcTzs)
  return plot(market) ?? plot(point.btcPrice)
}

function PricePlot({ history, ledger, size }: { history: PortfolioHistory; ledger: LedgerRow[]; size: ChartSize }) {
  const colors = CHART
  const { currency } = history
  const data = useMemo<Row[]>(() => {
    const byDay = new Map<string, LedgerRow[]>()
    for (const row of ledger) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row])
    return history.points.map((p) => {
      const txs = byDay.get(p.date) ?? []
      return {
        date: p.date,
        price: plot(p.btcPrice),
        avg: plot(p.avgCostPerBtc),
        buy: markerPrice(txs.find((t) => t.type === 'BUY'), currency, p),
        sell: markerPrice(txs.find((t) => t.type === 'SELL'), currency, p),
        point: p,
        txs,
      }
    })
  }, [history, ledger, currency])
  const span = spanDays(history.from ?? history.to, history.to)
  const dates = data.map((d) => d.date)

  return (
    <>
      <ChartLegend
        items={[
          { label: 'BTC price', color: colors.price, shape: 'line' },
          { label: 'Your average cost', color: colors.avgCost, shape: 'step' },
          { label: 'Buy', color: colors.buy, shape: 'up' },
          { label: 'Sell', color: colors.sell, shape: 'down' },
        ]}
      />
      <ChartFrame
        size={size}
        label={`Bitcoin price and your average cost per BTC in ${currency}, with buys and sells marked`}
      >
        {(width, height) => (
          <ComposedChart width={width} height={height} data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} strokeOpacity={colors.gridOpacity} />
            <XAxis
              dataKey="date"
              ticks={pickTicks(dates, tickCountFor(width))}
              interval={0}
              tick={<EdgeAnchoredTick fill={colors.axis} format={(d) => formatAxisDay(d, span)} />}
              tickLine={false}
              axisLine={{ stroke: colors.grid, strokeOpacity: 0.5 }}
            />
            <YAxis
              width={72}
              domain={['auto', 'auto']}
              tickCount={5}
              tickFormatter={(v: number) => formatCompactFiat(v, currency)}
              tick={{ fontSize: 11, fill: colors.axis }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={(props: TipProps<Row>) => <PriceTooltip {...props} currency={currency} colors={colors} />}
              cursor={{ stroke: colors.cursor, strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="price"
              stroke={colors.price}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="avg"
              stroke={colors.avgCost}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Scatter
              dataKey="buy"
              isAnimationActive={false}
              shape={(props: unknown) => marker(props, 'buy', colors)}
            />
            <Scatter dataKey="sell" isAnimationActive={false} shape={(props: unknown) => marker(props, 'sell', colors)} />
          </ComposedChart>
        )}
      </ChartFrame>
    </>
  )
}

/**
 * Scatter calls its shape for every row of the chart's data, including days
 * without a trade (value null, drawn at the top edge); those get no marker.
 */
function marker(props: unknown, kind: 'buy' | 'sell', colors: ChartColors) {
  const { cx = 0, cy = 0, payload } = props as { cx?: number; cy?: number; payload?: Row }
  if (!payload || payload[kind] === null) return <g />
  return (
    <TrianglePath
      cx={cx}
      cy={cy}
      direction={kind === 'buy' ? 'up' : 'down'}
      fill={kind === 'buy' ? colors.buy : colors.sell}
      ring={colors.surface}
    />
  )
}

function PriceTooltip({ active, payload, currency, colors }: TipProps<Row> & { currency: Currency; colors: ChartColors }) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) return null
  const p = row.point
  return (
    <TooltipBox
      title={formatDay(p.date)}
      footer={
        row.txs.length > 0 || p.priceSource === 'carried_forward' ? (
          <>
            {row.txs.map((t) => (
              <TradeLine key={t.id} t={t} currency={currency} colors={colors} />
            ))}
            {p.priceSource === 'carried_forward' && <p>{CARRIED_TIP}</p>}
          </>
        ) : undefined
      }
    >
      <TooltipRow label="BTC price" color={colors.price} value={formatFiat(p.btcPrice, currency)} />
      <TooltipRow label="Your avg cost" color={colors.avgCost} value={formatFiat(p.avgCostPerBtc, currency)} />
    </TooltipBox>
  )
}

/** "▲ Buy 0.01000000 BTC for TSh 2,500,000 (+ TSh 25,000 fee) at TSh 250,000,000/BTC" */
function TradeLine({ t, currency, colors }: { t: LedgerRow; currency: Currency; colors: ChartColors }) {
  const marker = t.type === 'SELL' ? '▼' : t.type === 'BUY' ? '▲' : '•'
  const color = t.type === 'SELL' ? colors.sell : t.type === 'BUY' ? colors.buy : undefined
  const fee = t.feeAmount !== '0.00' ? ` + ${formatFiat(t.feeAmount, t.fiatCurrency)} fee` : ''
  return (
    <p className="mt-0.5 first:mt-0">
      <span style={{ color }} aria-hidden>
        {marker}{' '}
      </span>
      <span className="font-semibold text-text">{TYPE_LABELS[t.type]}</span>{' '}
      {formatBTC(t.btc)} for {formatFiat(t.fiatAmount, t.fiatCurrency)}
      {fee}
      {t.type !== 'TRANSFER_IN' && <> at {formatFiat(impliedPrice(t, currency), currency)}/BTC</>}
    </p>
  )
}
