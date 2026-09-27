import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { ApiError, api } from '../../lib/api'
import { formatBTC, formatDate, formatDateTime } from '../../lib/format'
import { satsToBtc } from '../../lib/money'
import { queryKeys } from '../../lib/queries'
import { isOverSellError } from './overSell'

/**
 * Explains a 422 "sell exceeds holdings" error: which sell breaks, when, and by
 * how much. `currentId` is the transaction being edited/deleted, if any.
 */
export function OverSellMessage({
  error,
  currentId,
  action,
}: {
  error: ApiError
  currentId?: number
  action: 'save' | 'delete'
}) {
  const details = isOverSellError(error) ? error.details : null
  const otherId = details?.transactionId != null && details.transactionId !== currentId ? details.transactionId : null
  const other = useQuery({
    queryKey: queryKeys.transaction(otherId ?? 0),
    queryFn: () => api.getTransaction(otherId!),
    enabled: otherId !== null,
  })

  if (!details) return null
  const attempted = formatBTC(satsToBtc(details.attemptedSats))
  const available = formatBTC(satsToBtc(details.availableSats))
  const day = formatDate(details.date)

  let explanation: string
  if (otherId === null) {
    explanation = `This sell of ${attempted} on ${day} is more than the ${available} you held at that point.`
  } else if (action === 'delete') {
    explanation =
      `Deleting it would leave your later sell of ${attempted} on ${day} with only ${available} available. ` +
      'Edit or delete that sell first.'
  } else {
    explanation =
      `This change would leave your later sell of ${attempted} on ${day} with only ${available} available. ` +
      'Adjust that sell first, or change this transaction differently.'
  }

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
    >
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {action === 'delete' ? "Can't delete this transaction" : "Can't save: not enough BTC"}
      </p>
      <p className="mt-1">{explanation}</p>
      {otherId !== null && (
        <p className="mt-2">
          Conflicts with{' '}
          <Link to={`/transactions/${otherId}/edit`} className="font-semibold underline underline-offset-2">
            sell #{otherId}
            {other.data && ` · ${formatDateTime(other.data.date)} · ${formatBTC(other.data.btc)}`}
          </Link>
        </p>
      )}
      <p className="mt-2 text-xs opacity-80">Server message: {error.message}</p>
    </div>
  )
}
