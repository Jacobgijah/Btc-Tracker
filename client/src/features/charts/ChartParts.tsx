import type { ReactNode } from 'react'
import { ChartLine as ChartIcon, Info, Plus } from 'lucide-react'
import { Card, ErrorState, LinkButton, SegmentedControl, Skeleton } from '../../components/ui'
import { cx } from '../../lib/cx'
import { HISTORY_RANGES, type HistoryRange, type PortfolioHistory } from '../../lib/types'
import { chartHeight, useElementWidth } from './chartUtils'

export type ChartSize = 'compact' | 'full'

export function RangeSelector({
  name,
  value,
  onChange,
}: {
  name: string
  value: HistoryRange
  onChange: (range: HistoryRange) => void
}) {
  return (
    <SegmentedControl<HistoryRange>
      name={name}
      label="Time range"
      hideLabel
      size="sm"
      className="w-full sm:w-64"
      value={value}
      onChange={onChange}
      options={HISTORY_RANGES.map((r) => ({ value: r, label: r }))}
    />
  )
}

/** Card with a title, an optional one-line description and controls (range, units). */
export function ChartCard({
  id,
  title,
  description,
  controls,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  controls?: ReactNode
  children: ReactNode
}) {
  return (
    <Card aria-labelledby={`${id}-heading`} className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-base font-semibold text-slate-950 dark:text-white">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{description}</p>}
        </div>
        {controls && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{controls}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

/** Measures the available width and renders the chart once it is known. */
export function ChartFrame({
  size,
  label,
  children,
}: {
  size: ChartSize
  /** Accessible summary of what the chart shows. */
  label: string
  children: (width: number, height: number) => ReactNode
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = chartHeight(width, size)
  return (
    <div ref={ref} role="img" aria-label={label} className="w-full select-none" style={{ minHeight: height }}>
      {width > 0 && children(width, height)}
    </div>
  )
}

export function ChartSkeleton({ size }: { size: ChartSize }) {
  return (
    <div aria-busy="true" aria-label="Loading chart">
      <Skeleton className={size === 'compact' ? 'h-[200px] sm:h-[240px]' : 'h-[260px] sm:h-[360px]'} />
    </div>
  )
}

export function ChartEmpty({ size, message }: { size: ChartSize; message: string }) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 px-6 text-center dark:border-slate-700',
        size === 'compact' ? 'h-[200px] sm:h-[240px]' : 'h-[260px] sm:h-[360px]',
      )}
    >
      <ChartIcon className="size-7 text-slate-400" aria-hidden />
      <p className="max-w-xs text-sm text-slate-600 dark:text-slate-400">{message}</p>
      <LinkButton to="/transactions/new" variant="secondary">
        <Plus className="size-4" aria-hidden />
        Add a transaction
      </LinkButton>
    </div>
  )
}

export const EMPTY_HISTORY_MESSAGE = 'Add a few transactions to see your history.'

/** Loading / error / empty handling shared by the history charts. */
export function HistoryState({
  query,
  size,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: PortfolioHistory; refetch: () => unknown }
  size: ChartSize
  children: (history: PortfolioHistory) => ReactNode
}) {
  if (query.isPending) return <ChartSkeleton size={size} />
  if (query.isError || !query.data) {
    return <ErrorState title="Couldn't load this chart" error={query.error} onRetry={() => query.refetch()} />
  }
  if (query.data.points.length === 0) return <ChartEmpty size={size} message={EMPTY_HISTORY_MESSAGE} />
  return (
    <>
      {children(query.data)}
      <PriceNote history={query.data} />
    </>
  )
}

/** A quiet note when some days had no price of their own. */
export function PriceNote({ history }: { history: PortfolioHistory }) {
  const { daysWithCarriedForwardPrices: carried, daysWithoutPrice: missing, totalDays } = history
  if (!carried && !missing) return null
  const parts = []
  if (carried) {
    parts.push(
      `${carried} of ${totalDays} ${totalDays === 1 ? 'day uses' : 'days use'} a price carried forward from an earlier day`,
    )
  }
  if (missing) parts.push(`${missing} ${missing === 1 ? 'day has' : 'days have'} no price yet`)
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{parts.join('; ')}.</span>
    </p>
  )
}

export type LegendShape = 'area' | 'line' | 'step' | 'bar' | 'up' | 'down'

function LegendKey({ shape, color }: { shape: LegendShape; color: string }) {
  const common = { width: 18, height: 12, 'aria-hidden': true } as const
  switch (shape) {
    case 'area':
      return (
        <svg {...common}>
          <rect x="0" y="4" width="18" height="8" fill={color} opacity="0.15" />
          <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" />
        </svg>
      )
    case 'step':
      return (
        <svg {...common}>
          <polyline points="0,10 7,10 7,3 18,3" fill="none" stroke={color} strokeWidth="2" />
        </svg>
      )
    case 'bar':
      return (
        <svg {...common}>
          <rect x="5" y="1" width="8" height="11" rx="2" fill={color} />
        </svg>
      )
    case 'up':
    case 'down':
      return (
        <svg {...common}>
          <TrianglePath cx={9} cy={6} direction={shape} fill={color} ring="none" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <line x1="0" y1="6" x2="18" y2="6" stroke={color} strokeWidth="2" />
        </svg>
      )
  }
}

/** Legend above the plot; text stays in ink colours, the key beside it carries the series colour. */
export function ChartLegend({ items }: { items: { label: string; color: string; shape: LegendShape }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <LegendKey shape={item.shape} color={item.color} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/** ▲ / ▼ marker, r ≈ 5, with a ring in the surface colour so it stays legible over lines. */
export function TrianglePath({
  cx,
  cy,
  direction,
  fill,
  ring,
}: {
  cx: number
  cy: number
  direction: 'up' | 'down'
  fill: string
  ring: string
}) {
  const r = 6
  const points =
    direction === 'up'
      ? `${cx},${cy - r} ${cx + r},${cy + r * 0.75} ${cx - r},${cy + r * 0.75}`
      : `${cx},${cy + r} ${cx + r},${cy - r * 0.75} ${cx - r},${cy - r * 0.75}`
  return <polygon points={points} fill={fill} stroke={ring} strokeWidth={ring === 'none' ? 0 : 2} strokeLinejoin="round" />
}

interface AxisTickProps {
  x?: number
  y?: number
  index?: number
  visibleTicksCount?: number
  payload?: { value: string }
}

/**
 * X-axis tick whose first and last labels are anchored inwards, so the ends of the
 * axis are never clipped by the chart edge.
 */
export function EdgeAnchoredTick({
  format,
  fill,
  ...props
}: AxisTickProps & { format: (value: string, index: number) => string; fill: string }) {
  const { x = 0, y = 0, index = 0, visibleTicksCount = 1, payload } = props
  if (!payload) return null
  const anchor = index === 0 && visibleTicksCount > 1 ? 'start' : index === visibleTicksCount - 1 && index > 0 ? 'end' : 'middle'
  return (
    <text x={x} y={y + 12} textAnchor={anchor} fill={fill} fontSize={11} className="tabular">
      {format(payload.value, index)}
    </text>
  )
}

export function TooltipBox({ title, children, footer }: { title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="tabular max-w-[17rem] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <p className="mb-1 font-semibold text-slate-950 dark:text-white">{title}</p>
      <dl className="space-y-0.5">{children}</dl>
      {footer && <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-slate-600 dark:border-slate-800 dark:text-slate-400">{footer}</div>}
    </div>
  )
}

/** Recharts' tooltip props, narrowed to what these charts read. */
export interface TipProps<T> {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: T }>
}

export const CARRIED_TIP = 'Price carried forward from an earlier day'

export function TooltipRow({ label, value, color }: { label: ReactNode; value: ReactNode; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
        {color && <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
        {label}
      </dt>
      <dd className="text-right font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  )
}
