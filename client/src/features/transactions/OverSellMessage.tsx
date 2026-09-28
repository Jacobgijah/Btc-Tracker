import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { LINK_CLASSES, Notice } from '../../components/ui'
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
    <Notice
      tone="error"
      role="alert"
      title={action === 'delete' ? "Can't delete this transaction" : "Can't save: not enough BTC"}
    >
      <p>{explanation}</p>
      {otherId !== null && (
        <p className="mt-2">
          Conflicts with{' '}
          <Link to={`/transactions/${otherId}/edit`} className={LINK_CLASSES}>
            sell #{otherId}
            {other.data && ` · ${formatDateTime(other.data.date)} · ${formatBTC(other.data.btc)}`}
          </Link>
        </p>
      )}
      <p className="mt-2 text-xs text-text-muted">Server message: {error.message}</p>
    </Notice>
  )
}
