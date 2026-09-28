import { useId, type ComponentProps, type ReactNode } from 'react'
import { XCircle } from 'lucide-react'
import { cx } from '../lib/cx'

const INPUT =
  'block w-full min-h-11 rounded-xl border bg-surface px-3 py-2 text-text placeholder:text-text-muted ' +
  'focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-accent disabled:opacity-60'

// Invalid: a blue border doubled by a ring (3.99:1, fine for a UI boundary) plus the message with an icon.
const borderFor = (error?: string) => (error ? 'border-error ring-1 ring-error' : 'border-border-strong')

interface FieldChrome {
  label: ReactNode
  error?: string
  hint?: ReactNode
  /** Extra content rendered right of the label (e.g. a unit toggle). */
  labelAside?: ReactNode
  className?: string
}

function FieldWrapper({
  id,
  label,
  error,
  hint,
  labelAside,
  className,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex min-h-6 items-end justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        {labelAside}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-text">
          <XCircle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined
}

export function TextField({
  label,
  error,
  hint,
  labelAside,
  className,
  suffix,
  ...props
}: FieldChrome & ComponentProps<'input'> & { suffix?: ReactNode }) {
  const id = useId()
  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint} labelAside={labelAside} className={className}>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={cx(INPUT, borderFor(error), suffix ? 'pr-16' : undefined)}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-text-muted">
            {suffix}
          </span>
        )}
      </div>
    </FieldWrapper>
  )
}

export function SelectField({
  label,
  error,
  hint,
  labelAside,
  className,
  children,
  ...props
}: FieldChrome & ComponentProps<'select'>) {
  const id = useId()
  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint} labelAside={labelAside} className={className}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cx(INPUT, borderFor(error))}
        {...props}
      >
        {children}
      </select>
    </FieldWrapper>
  )
}

export function TextAreaField({
  label,
  error,
  hint,
  labelAside,
  className,
  ...props
}: FieldChrome & ComponentProps<'textarea'>) {
  const id = useId()
  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint} labelAside={labelAside} className={className}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cx(INPUT, borderFor(error))}
        {...props}
      />
    </FieldWrapper>
  )
}
