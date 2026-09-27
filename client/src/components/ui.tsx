import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Download, RotateCw } from 'lucide-react'
import { TONE_CLASSES, TYPE_LABELS, plTone, type Tone } from '../lib/format'
import { errorMessage } from '../lib/api'
import type { TransactionType } from '../lib/types'
import { cx } from '../lib/cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  // Bitcoin orange with near-black text keeps contrast high (~8:1).
  primary: 'bg-btc text-slate-950 hover:bg-btc-600 shadow-sm',
  secondary:
    'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  ghost: 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500',
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

export function Card({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cx(
        'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800', className)} aria-hidden />
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
        'flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
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

/** Radio group styled as a segmented control; arrow keys work natively. */
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
      <legend className={cx(hideLabel ? 'sr-only' : 'mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300')}>
        {label}
      </legend>
      <div className="inline-flex w-full rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
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
                'flex cursor-pointer items-center justify-center rounded-lg px-3 font-semibold text-slate-600 transition-colors select-none',
                'peer-checked:bg-white peer-checked:text-slate-950 peer-checked:shadow-sm dark:text-slate-300 dark:peer-checked:bg-slate-600 dark:peer-checked:text-white',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-btc',
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

const TYPE_STYLES: Record<TransactionType, { className: string; Icon: typeof ArrowDownLeft }> = {
  BUY: {
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
    Icon: ArrowDownLeft,
  },
  SELL: { className: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200', Icon: ArrowUpRight },
  TRANSFER_IN: { className: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200', Icon: Download },
}

export function TypeBadge({ type }: { type: TransactionType }) {
  const { className, Icon } = TYPE_STYLES[type]
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', className)}>
      <Icon className="size-3.5" aria-hidden />
      {TYPE_LABELS[type]}
    </span>
  )
}

/** P/L value: coloured, and always carries its sign so colour isn't the only cue. */
export function Pnl({
  value,
  children,
  className,
}: {
  value: string | null | undefined
  children: ReactNode
  className?: string
}) {
  const tone: Tone = plTone(value)
  return <span className={cx(TONE_CLASSES[tone], className)}>{children}</span>
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h1>
      {actions}
    </div>
  )
}
