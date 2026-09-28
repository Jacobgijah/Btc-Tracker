import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { Check, KeyRound, LogOut } from 'lucide-react'
import { Button, Card, ErrorState, Notice, PageHeader, SegmentedControl, Skeleton } from '../../components/ui'
import { TextField } from '../../components/fields'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/AuthContext'
import { LogoutButton } from '../auth/LogoutButton'
import { api, errorMessage } from '../../lib/api'
import { useSettings, useUpdateSettings } from '../../lib/queries'
import { cx } from '../../lib/cx'
import type { CostMethod, Currency, Settings } from '../../lib/types'

const COST_METHODS: { value: CostMethod; title: string; body: string }[] = [
  {
    value: 'AVERAGE',
    title: 'Average cost',
    body: 'Every bitcoin you hold costs the same: the average price you paid. A sell uses that average.',
  },
  {
    value: 'FIFO',
    title: 'First in, first out (FIFO)',
    body: 'Sells use up your oldest purchases first, at the price you paid for them.',
  },
]

export function SettingsPage() {
  const settings = useSettings()
  const { user: me } = useAuth()
  const update = useUpdateSettings()
  const toast = useToast()

  const save = (patch: Partial<Settings>, label: string) =>
    update.mutate(patch, {
      onSuccess: () => toast.success(`${label} saved`),
      onError: (err) => toast.error(`Couldn't save: ${errorMessage(err)}`),
    })

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Settings" />

      {settings.isError ? (
        <ErrorState title="Couldn't load settings" error={settings.error} onRetry={() => settings.refetch()} />
      ) : (
        <>
          <Card aria-labelledby="cost-heading">
            <h2 id="cost-heading" className="font-semibold">
              Cost method
            </h2>
            <p className="mt-1 text-sm text-text-muted">How the cost of the bitcoin you sell is worked out.</p>
            {settings.isPending ? (
              <Skeleton className="mt-4 h-40" />
            ) : (
              <fieldset className="mt-4">
                <legend className="sr-only">Cost method</legend>
                <div className="space-y-2">
                  {COST_METHODS.map((m) => (
                    <RadioCard
                      key={m.value}
                      name="cost-method"
                      value={m.value}
                      checked={settings.data.costMethod === m.value}
                      onChange={() => save({ costMethod: m.value }, 'Cost method')}
                      title={m.title}
                    >
                      {m.body}
                    </RadioCard>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="mt-3 rounded-xl border border-border bg-bg p-3 text-sm text-text">
              Your <strong>total</strong> profit/loss is the same either way. Only the split between realized
              (from sells) and unrealized (on what you still hold) changes.
            </p>
          </Card>

          <Card aria-labelledby="currency-heading">
            <h2 id="currency-heading" className="font-semibold">
              Display currency
            </h2>
            <p className="mt-1 mb-3 text-sm text-text-muted">
              Used for values and P/L across the app. You can also switch it from the top bar.
            </p>
            {settings.isPending ? (
              <Skeleton className="h-12" />
            ) : (
              <SegmentedControl<Currency>
                name="settings-currency"
                label="Display currency"
                hideLabel
                value={settings.data.displayCurrency}
                onChange={(displayCurrency) => save({ displayCurrency }, 'Display currency')}
                options={[
                  { value: 'TZS', label: 'TZS (TSh)' },
                  { value: 'USD', label: 'USD ($)' },
                ]}
              />
            )}
          </Card>
        </>
      )}

      <Card aria-labelledby="account-heading">
        <h2 id="account-heading" className="font-semibold">
          Account
        </h2>
        <p className="mt-2 text-sm text-text-muted">Signed in as</p>
        <div className="font-medium break-all">{me ? me.email : <Skeleton className="h-5 w-48" />}</div>
        <LogoutButton variant="secondary" className="mt-4 w-full sm:w-auto">
          <LogOut className="size-4" aria-hidden /> Log out
        </LogoutButton>
      </Card>

      <ChangePasswordCard />
    </div>
  )
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(12, 'New password must be at least 12 characters'),
  })
  .strict()
type ChangePasswordValues = z.infer<typeof changePasswordSchema>

function ChangePasswordCard() {
  const toast = useToast()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  })
  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: ChangePasswordValues) => api.changePassword(currentPassword, newPassword),
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await change.mutateAsync(values)
      toast.success('Password changed')
      reset()
    } catch (err) {
      setServerError(errorMessage(err))
    }
  })

  return (
    <Card aria-labelledby="password-heading">
      <h2 id="password-heading" className="font-semibold">
        Change password
      </h2>
      <form onSubmit={onSubmit} noValidate className="mt-3 space-y-4">
        {serverError && (
          <Notice tone="error" role="alert">
            {serverError}
          </Notice>
        )}
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters."
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          <KeyRound className="size-4" aria-hidden />
          {isSubmitting ? 'Changing…' : 'Change password'}
        </Button>
      </form>
    </Card>
  )
}

function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  children,
}: {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  title: string
  children: ReactNode
}) {
  return (
    <label className="relative block cursor-pointer">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={cx(
          'flex items-start gap-3 rounded-xl border border-border-strong p-3 transition-colors hover:bg-hover',
          'peer-checked:border-accent peer-checked:ring-1 peer-checked:ring-accent',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
        )}
      >
        <span
          className={cx(
            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
            checked ? 'border-accent bg-accent text-on-accent' : 'border-border-strong',
          )}
          aria-hidden
        >
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="mt-0.5 block text-sm text-text-muted">{children}</span>
        </span>
      </span>
    </label>
  )
}
