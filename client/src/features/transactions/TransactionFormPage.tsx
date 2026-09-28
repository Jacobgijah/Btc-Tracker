import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Card, ErrorState, LinkButton, PageHeader, Skeleton } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { queryKeys } from '../../lib/queries'
import { TransactionForm } from './TransactionForm'

export function NewTransactionPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add transaction" />
      <Card>
        <TransactionForm />
      </Card>
    </div>
  )
}

export function EditTransactionPage() {
  const id = Number(useParams().id)
  const valid = Number.isInteger(id) && id > 0
  const tx = useQuery({
    queryKey: queryKeys.transaction(id),
    queryFn: () => api.getTransaction(id),
    enabled: valid,
    // Don't reset the form under the user when the window regains focus.
    refetchOnWindowFocus: false,
  })

  const notFound = !valid || (tx.error instanceof ApiError && tx.error.status === 404)

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Edit transaction${valid ? ` #${id}` : ''}`} />
      {notFound ? (
        <Card className="text-center">
          <p className="font-semibold">This transaction doesn't exist.</p>
          <LinkButton to="/transactions" className="mt-4">
            <ArrowLeft className="size-4" aria-hidden /> Back to transactions
          </LinkButton>
        </Card>
      ) : tx.isPending ? (
        <Card aria-busy="true" aria-label="Loading transaction">
          <div className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        </Card>
      ) : tx.isError ? (
        <ErrorState title="Couldn't load this transaction" error={tx.error} onRetry={() => tx.refetch()} />
      ) : (
        <Card>
          <TransactionForm key={tx.data.id} original={tx.data} />
        </Card>
      )}
    </div>
  )
}
