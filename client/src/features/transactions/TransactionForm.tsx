import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Info, Loader2, Save, Wallet } from 'lucide-react'
import { Button, LinkButton, Notice, SegmentedControl } from '../../components/ui'
import { TextAreaField, TextField } from '../../components/fields'
import { useToast } from '../../components/Toast'
import { ApiError, api, errorMessage } from '../../lib/api'
import { formatBTC, formatDate, formatDateTime, formatSats } from '../../lib/format'
import {
  amountToSats,
  btcInputToSatsInput,
  satsInputToBtcInput,
  satsToBtc,
  satsToBtcInput,
} from '../../lib/money'
import { invalidateLedger, queryKeys, usePortfolio } from '../../lib/queries'
import { useDebounced } from '../../lib/useDebounced'
import { cx } from '../../lib/cx'
import type { Currency, Transaction, TransactionType } from '../../lib/types'
import { OverSellMessage } from './OverSellMessage'
import { isOverSellError } from './overSell'
import { TransactionPreview } from './TransactionPreview'
import {
  defaultFormValues,
  formFieldForServerField,
  formValuesFromTransaction,
  parseLocalDateTime,
  toLocalDateTimeInput,
  toTransactionInput,
  transactionSchema,
  type AmountUnit,
  type TransactionFormValues,
} from './transactionSchema'

const TYPE_OPTIONS: { value: TransactionType; label: string; help: string }[] = [
  { value: 'BUY', label: 'Buy', help: 'You paid TZS or USD for bitcoin.' },
  { value: 'SELL', label: 'Sell', help: 'You sold bitcoin for TZS or USD.' },
  {
    value: 'TRANSFER_IN',
    label: 'Transfer in',
    help: 'Bitcoin you received without buying it (gift, payment). Its value then becomes its cost.',
  },
]

const FIAT_LABELS: Record<TransactionType, { label: string; hint: string }> = {
  BUY: { label: 'Amount paid', hint: 'Excluding the fee.' },
  SELL: { label: 'Amount received', hint: 'Before the fee is taken off.' },
  TRANSFER_IN: { label: 'Market value', hint: 'What it was worth when received. Enter 0 for a zero cost basis.' },
}

type RateInfo =
  | { kind: 'saved' }
  | { kind: 'loading'; day: string }
  | { kind: 'found'; day: string; source: 'latest_snapshot' | 'historical_lookup'; asOf: string }
  | { kind: 'missing'; day: string; message: string }
  | { kind: 'manual' }
  | { kind: 'none' }

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

/** UTC day of a datetime-local value (the server looks rates up per UTC day). */
function utcDayOf(local: string): string | null {
  const d = parseLocalDateTime(local)
  if (!d || d.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return null
  return d.toISOString().slice(0, 10)
}

const trimZeros = (v: string) => (v.includes('.') ? v.replace(/\.?0+$/, '') : v)

export function TransactionForm({ original }: { original?: Transaction }) {
  const isEdit = original !== undefined
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const initialValues = useMemo(
    () => (original ? formValuesFromTransaction(original) : defaultFormValues()),
    [original],
  )

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    trigger,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  })
  const values = useWatch({ control }) as TransactionFormValues

  // --- USD/TZS pre-fill ----------------------------------------------------
  // New transactions look the rate up straight away; edits keep the stored
  // rate until the date is changed.
  const [dateTouched, setDateTouched] = useState(!isEdit)
  const currentDay = utcDayOf(values.date)
  const day = useDebounced(currentDay, 400)
  const lookupDay = dateTouched ? day : null

  const fx = useQuery({
    queryKey: queryKeys.fx(lookupDay ?? ''),
    queryFn: () => api.fxForDate(lookupDay!),
    enabled: lookupDay !== null,
    retry: false,
    staleTime: Infinity,
  })
  const fxKey = lookupDay ? `${lookupDay}:${fx.status}` : 'none'
  // The UTC day for which the user typed their own rate; a lookup never overwrites it.
  const [manualDay, setManualDay] = useState<string | null>(null)
  const isManual = manualDay !== null && manualDay === (currentDay ?? 'none')

  // While the date just changed, the field still holds the previous day's rate:
  // don't allow saving until the lookup for the new day has answered.
  const ratePending = dateTouched && currentDay !== null && !isManual && (currentDay !== lookupDay || fx.isFetching)

  const rateInfo: RateInfo =
    isManual
      ? { kind: 'manual' }
      : ratePending
        ? { kind: 'loading', day: currentDay }
      : !lookupDay
        ? isEdit && !dateTouched
          ? { kind: 'saved' }
          : { kind: 'none' }
        : fx.isPending
          ? { kind: 'loading', day: lookupDay }
          : fx.isSuccess
            ? { kind: 'found', day: lookupDay, source: fx.data.source, asOf: fx.data.asOf }
            : { kind: 'missing', day: lookupDay, message: errorMessage(fx.error) }

  // Write each lookup result into the field once (it stays editable).
  const appliedFxKey = useRef<string | null>(null)
  useEffect(() => {
    if (!lookupDay || fx.isFetching || appliedFxKey.current === fxKey || manualDay === lookupDay) return
    if (fx.isSuccess) {
      appliedFxKey.current = fxKey
      setValue('usdTzsRate', trimZeros(fx.data.usdTzs), { shouldDirty: true, shouldValidate: isSubmitted })
    } else if (fx.isError) {
      appliedFxKey.current = fxKey
      setValue('usdTzsRate', '', { shouldDirty: true })
    }
  }, [lookupDay, fxKey, fx.isFetching, fx.isSuccess, fx.isError, fx.data, setValue, isSubmitted, manualDay])

  // --- Holdings (for sells) --------------------------------------------------
  const portfolio = usePortfolio()
  const availableSats = useMemo(() => {
    if (!portfolio.data) return null
    let held = BigInt(portfolio.data.holdings.sats)
    // The row being edited is already counted in the current holdings.
    if (original) held += original.type === 'SELL' ? BigInt(original.sats) : -BigInt(original.sats)
    return held < 0n ? 0n : held
  }, [portfolio.data, original])
  const enteredSats = amountToSats(values.amount ?? '', values.amountUnit)
  const overHoldings = values.type === 'SELL' && availableSats !== null && enteredSats !== null && enteredSats > availableSats

  // --- BTC <-> sats ------------------------------------------------------------
  const switchUnit = (unit: AmountUnit) => {
    const current = getValues('amountUnit')
    if (unit === current) return
    const amount = getValues('amount')
    const converted = unit === 'SATS' ? btcInputToSatsInput(amount) : satsInputToBtcInput(amount)
    setValue('amountUnit', unit)
    if (converted !== null) setValue('amount', converted)
    if (isSubmitted || errors.amount) void trigger('amount')
  }

  const fillAll = () => {
    if (availableSats === null) return
    const unit = getValues('amountUnit')
    setValue('amount', unit === 'SATS' ? availableSats.toString() : satsToBtcInput(availableSats), {
      shouldValidate: true,
    })
  }

  // --- Submit ------------------------------------------------------------------
  const save = useMutation({
    mutationFn: (v: TransactionFormValues) => {
      const input = toTransactionInput(v, original)
      return original ? api.updateTransaction(original.id, input) : api.createTransaction(input)
    },
  })
  const [formError, setFormError] = useState<string | null>(null)

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    if (ratePending) {
      setFormError('Still looking up the USD/TZS rate for this date. Try again in a moment.')
      return
    }
    try {
      await save.mutateAsync(v)
    } catch (err) {
      if (err instanceof ApiError) {
        if (isOverSellError(err)) return // shown by <OverSellMessage>
        const details = err.details as { field?: string } | undefined
        if (err.status === 422 && details?.field === 'usdTzsRate') {
          setError('usdTzsRate', { message: err.message }, { shouldFocus: true })
          return
        }
        let mapped = false
        for (const [field, messages] of Object.entries(err.fieldErrors)) {
          const name = formFieldForServerField(field)
          if (name && messages[0]) {
            setError(name, { message: messages[0] }, { shouldFocus: !mapped })
            mapped = true
          }
        }
        const rest = err.formErrors.join(' ')
        if (!mapped || rest) setFormError(rest || err.message)
        return
      }
      setFormError(errorMessage(err))
      return
    }
    await invalidateLedger(queryClient)
    toast.success(isEdit ? 'Transaction updated' : 'Transaction added')
    navigate('/transactions')
  })

  const fiatCopy = FIAT_LABELS[values.type]
  const currency: Currency = values.fiatCurrency
  const overSellError = save.error && isOverSellError(save.error) ? save.error : null

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Type */}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-text">Type</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPE_OPTIONS.map((o) => (
            <label key={o.value} className="relative block cursor-pointer">
              <input type="radio" value={o.value} className="peer sr-only" {...register('type')} />
              <span
                className={cx(
                  'block h-full rounded-xl border border-border-strong bg-surface p-3 transition-colors hover:bg-hover',
                  'peer-checked:border-accent peer-checked:ring-1 peer-checked:ring-accent',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                )}
              >
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="mt-0.5 block text-xs text-text-muted">{o.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Date & time"
          type="datetime-local"
          max={toLocalDateTimeInput(new Date())}
          error={errors.date?.message}
          hint="Your local time."
          {...register('date', { onChange: () => setDateTouched(true) })}
        />

        <TextField
          label="Bitcoin amount"
          inputMode={values.amountUnit === 'BTC' ? 'decimal' : 'numeric'}
          autoComplete="off"
          placeholder={values.amountUnit === 'BTC' ? '0.0125' : '1250000'}
          suffix={values.amountUnit === 'BTC' ? 'BTC' : 'sats'}
          error={errors.amount?.message}
          hint={
            enteredSats !== null && enteredSats > 0n
              ? values.amountUnit === 'BTC'
                ? `= ${formatSats(enteredSats.toString())}`
                : `= ${formatBTC(satsToBtc(enteredSats))}`
              : values.amountUnit === 'BTC'
                ? 'Up to 8 decimal places.'
                : 'Whole sats (1 BTC = 100,000,000 sats).'
          }
          labelAside={
            <SegmentedControl<AmountUnit>
              name="amount-unit"
              label="Amount unit"
              hideLabel
              size="sm"
              className="w-32"
              value={values.amountUnit}
              onChange={switchUnit}
              options={[
                { value: 'BTC', label: 'BTC' },
                { value: 'SATS', label: 'sats' },
              ]}
            />
          }
          {...register('amount')}
        />
      </div>

      {values.type === 'SELL' && (
        <div
          className={cx(
            'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-bg p-3 text-sm text-text',
            overHoldings ? 'border-warning' : 'border-border',
          )}
        >
          {overHoldings ? (
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <Wallet className="size-4 shrink-0 text-text-muted" aria-hidden />
          )}
          <p className="flex-1">
            {availableSats === null ? (
              'Loading your holdings…'
            ) : (
              <>
                You can sell up to <strong className="tabular">{formatBTC(satsToBtc(availableSats))}</strong>
                {isEdit ? ' (current holdings plus this transaction)' : ' (current holdings)'}.
                {overHoldings && <strong className="block">That's more than you hold.</strong>}
              </>
            )}
          </p>
          {availableSats !== null && availableSats > 0n && (
            <Button variant="ghost" className="min-h-9 px-3" onClick={fillAll}>
              Sell all
            </Button>
          )}
        </div>
      )}

      <Controller
        control={control}
        name="fiatCurrency"
        render={({ field }) => (
          <SegmentedControl<Currency>
            name={field.name}
            label="Paid / received in"
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: 'TZS', label: 'TZS (TSh)' },
              { value: 'USD', label: 'USD ($)' },
            ]}
          />
        )}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={fiatCopy.label}
          inputMode="decimal"
          autoComplete="off"
          placeholder={currency === 'TZS' ? '2500000' : '600.00'}
          suffix={currency}
          hint={fiatCopy.hint}
          error={errors.fiatAmount?.message}
          {...register('fiatAmount')}
        />
        <TextField
          label="Fee"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          suffix={currency}
          hint={values.type === 'SELL' ? 'Optional. Must be less than the amount received.' : 'Optional.'}
          error={errors.feeAmount?.message}
          {...register('feeAmount')}
        />
      </div>

      <TextField
        label="USD/TZS rate"
        inputMode="decimal"
        autoComplete="off"
        placeholder="2650.00"
        suffix="TZS"
        error={errors.usdTzsRate?.message}
        hint={<RateHint info={rateInfo} />}
        {...register('usdTzsRate', { onChange: () => setManualDay(utcDayOf(getValues('date')) ?? 'none') })}
      />
      {rateInfo.kind === 'missing' && !errors.usdTzsRate && (
        <Notice tone="warning" role="alert" className="-mt-3">
          {rateInfo.message} Please enter the rate for {rateInfo.day} yourself (TZS per 1 USD).
        </Notice>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Exchange"
          autoComplete="off"
          placeholder="e.g. Binance"
          maxLength={100}
          hint="Optional."
          error={errors.exchange?.message}
          {...register('exchange')}
        />
        <TextAreaField
          label="Note"
          rows={2}
          maxLength={500}
          hint="Optional."
          error={errors.note?.message}
          {...register('note')}
        />
      </div>

      <TransactionPreview values={values} />

      {overSellError && <OverSellMessage error={overSellError} currentId={original?.id} action="save" />}
      {formError && (
        <Notice tone="error" role="alert" className="font-medium">
          {formError}
        </Notice>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton to="/transactions" variant="secondary">
          Cancel
        </LinkButton>
        <Button type="submit" variant="primary" disabled={isSubmitting || ratePending} className="sm:min-w-40">
          {isSubmitting || ratePending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {isSubmitting ? 'Saving…' : ratePending ? 'Checking rate…' : isEdit ? 'Save changes' : 'Add transaction'}
        </Button>
      </div>
    </form>
  )
}

function RateHint({ info }: { info: RateInfo }) {
  let text: string
  switch (info.kind) {
    case 'saved':
      text = 'Saved with this transaction. Change the date to look up a new rate.'
      break
    case 'loading':
      text = `Looking up the rate for ${info.day}…`
      break
    case 'found':
      text =
        info.source === 'latest_snapshot'
          ? `From the latest price snapshot (${formatDateTime(info.asOf)}). You can change it.`
          : info.asOf === info.day
            ? `Published daily rate for ${formatDate(info.asOf)} (UTC). You can change it.`
            : `Published rate for ${formatDate(info.asOf)}, the nearest earlier day. You can change it.`
      break
    case 'missing':
      text = 'No rate found for this date — enter it yourself.'
      break
    case 'manual':
      text = 'Entered by you.'
      break
    default:
      text = 'TZS per 1 USD on the trade date.'
  }
  return (
    <span className="inline-flex items-start gap-1">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      {text}
    </span>
  )
}
