import { SegmentedControl } from './ui'
import { useDisplayCurrency, useUpdateSettings } from '../lib/queries'
import { errorMessage } from '../lib/api'
import { useToast } from './Toast'
import type { Currency } from '../lib/types'

/** TZS | USD switch; saved to settings.displayCurrency and used across the app. */
export function CurrencyToggle({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'md' }) {
  const currency = useDisplayCurrency()
  const update = useUpdateSettings()
  const toast = useToast()

  return (
    <SegmentedControl<Currency>
      name="display-currency"
      label="Display currency"
      hideLabel
      size={size}
      className={className}
      value={currency}
      options={[
        { value: 'TZS', label: 'TZS' },
        { value: 'USD', label: 'USD' },
      ]}
      onChange={(displayCurrency) =>
        update.mutate(
          { displayCurrency },
          { onError: (err) => toast.error(`Couldn't save currency: ${errorMessage(err)}`) },
        )
      }
    />
  )
}
