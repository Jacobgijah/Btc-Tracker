import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Download, Info, RotateCw, XCircle } from 'lucide-react'
import { TYPE_LABELS, plTone, type Tone } from '../lib/format'
import { errorMessage } from '../lib/api'
import type { TransactionType } from '../lib/types'
import { cx } from '../lib/cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  // Gold with black-space text: 8.8:1.
  primary: 'bg-accent text-on-accent hover:bg-accent/90 active:bg-accent/80',
  secondary: 'border border-border-strong text-text hover:bg-hover active:bg-pressed',
  ghost: 'text-text hover:bg-hover active:bg-pressed',
  // Destructive: blue outline + white text (blue fills fail contrast); callers add an icon.
  danger: 'border border-error text-text hover:bg-hover active:bg-pressed',
}

const BASE_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={cx(BASE_BUTTON, VARIANTS[variant], className)} {...props} />
}

export function LinkButton({ variant = 'secondary', className, ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={cx(BASE_BUTTON, VARIANTS[variant], className)} {...props} />
}

/** Inline text link: white text with a blue underline (blue text is too faint at body size). */
export const LINK_CLASSES =
  'font-semibold text-text underline decoration-info decoration-2 underline-offset-4 hover:decoration-accent'

export function Card({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('rounded-2xl border border-border bg-surface p-4 sm:p-5', className)} {...props}>
      {children}
    </section>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-skeleton', className)} aria-hidden />
}

type NoticeTone = 'error' | 'warning' | 'info'

const NOTICE: Record<NoticeTone, { border: string; icon: string; Icon: typeof Info }> = {
  // Text stays white; the colour is carried by the border and the icon.
  error: { border: 'border-error', icon: 'text-error', Icon: XCircle },
  warning: { border: 'border-warning', icon: 'text-warning', Icon: AlertTriangle },
  info: { border: 'border-border', icon: 'text-info', Icon: Info },
}

/** Bordered message with an icon; errors are blue, warnings gold, and always say what happened in words. */
export function Notice({
  tone,
  title,
  children,
  className,
  role,
}: {
  tone: NoticeTone
  title?: ReactNode
  children?: ReactNode
  className?: string
  role?: 'alert' | 'status'
}) {
  const { border, icon, Icon } = NOTICE[tone]
  return (
    <div role={role} className={cx('flex items-start gap-2 rounded-xl border bg-surface p-3 text-sm text-text', border, className)}>
      <Icon className={cx('mt-0.5 size-4 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
      </div>
    </div>
  )
}

export function ErrorState({
  title = "Couldn't load this",
  error,
  onRetry,
  className,
}: {
  title?: string
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cx(
        'flex flex-col items-start gap-3 rounded-2xl border border-error bg-surface p-4 text-sm text-text',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 size-5 shrink-0 text-error" aria-hidden />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5">{errorMessage(error)}</p>
        </div>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary">
          <RotateCw className="size-4" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
}

/** Radio group styled as a segmented control; arrow keys work natively. Selected = gold. */
export function SegmentedControl<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  hideLabel = false,
  className,
  size = 'md',
}: {
  name: string
  label: string
  options: SegmentOption<T>[]
  value: T | undefined
  onChange: (value: T) => void
  hideLabel?: boolean
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <fieldset className={className}>
      <legend className={cx(hideLabel ? 'sr-only' : 'mb-1.5 text-sm font-medium text-text')}>{label}</legend>
      <div className="inline-flex w-full rounded-xl border border-border bg-bg p-1">
        {options.map((o) => (
          <label key={o.value} className="relative flex-1">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cx(
                'flex cursor-pointer items-center justify-center rounded-lg px-3 font-semibold text-text-muted transition-colors select-none',
                'hover:bg-hover hover:text-text peer-checked:bg-accent peer-checked:text-on-accent',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                size === 'sm' ? 'min-h-9 text-xs' : 'min-h-10 text-sm',
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const TYPE_STYLES: Record<TransactionType, { className: string; icon: string; Icon: typeof ArrowDownLeft }> = {
  // Outlines only: gold text is fine at badge size (8.3:1), blue text isn't, so SELL keeps white text.
  BUY: { className: 'border-gain text-gain', icon: 'text-gain', Icon: ArrowDownLeft },
  SELL: { className: 'border-loss text-text', icon: 'text-loss', Icon: ArrowUpRight },
  TRANSFER_IN: { className: 'border-border-strong text-text', icon: 'text-text-muted', Icon: Download },
}

export function TypeBadge({ type }: { type: TransactionType }) {
  const { className, icon, Icon } = TYPE_STYLES[type]
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', className)}>
      <Icon className={cx('size-3.5', icon)} aria-hidden />
      {TYPE_LABELS[type]}
    </span>
  )
}

/** ▲ / ▼ in the current colour, sized to the text. */
export function TrendTriangle({ direction, className }: { direction: 'up' | 'down'; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={cx('inline-block size-[0.6em] shrink-0 self-center', className)} aria-hidden>
      <path d={direction === 'up' ? 'M5 1.5 9.5 9h-9z' : 'M5 8.5 .5 1h9z'} fill="currentColor" />
    </svg>
  )
}

/**
 * Text colour of a P/L value by tone and size. Gains are gold at any size (8.3:1).
 * Losses: blue only when large (>= 24px), since blue text fails AA below that; small
 * losses stay white and only the ▼ is blue. Zero and "—" are cool-gray.
 */
const PNL_TEXT: Record<'sm' | 'lg', Record<Tone, string>> = {
  sm: { positive: 'text-gain', negative: 'text-text', neutral: 'text-text-muted' },
  lg: { positive: 'text-gain', negative: 'text-loss', neutral: 'text-text-muted' },
}

/**
 * Every P/L number in the app goes through this: sign (from the formatter) +
 * ▲ gold / ▼ blue icon + colour by the rules above, so colour is never the only cue.
 * `size="lg"` only for text >= 24px.
 */
export function Pnl({
  value,
  children,
  size = 'sm',
  icon = true,
  className,
}: {
  value: string | null | undefined
  children: ReactNode
  size?: 'sm' | 'lg'
  /** false for a secondary figure next to one that already has the icon (e.g. the % after an amount). */
  icon?: boolean
  className?: string
}) {
  const tone: Tone = plTone(value)
  return (
    <span className={cx('inline-flex items-baseline gap-1', PNL_TEXT[size][tone], className)} data-tone={tone}>
      {icon && tone !== 'neutral' && (
        <TrendTriangle
          direction={tone === 'positive' ? 'up' : 'down'}
          className={tone === 'positive' ? 'text-gain' : 'text-loss'}
        />
      )}
      {children}
    </span>
  )
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-text">{title}</h1>
      {actions}
    </div>
  )
}
