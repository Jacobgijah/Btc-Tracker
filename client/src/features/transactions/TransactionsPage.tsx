import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Card, ErrorState, LinkButton, PageHeader, Skeleton, TypeBadge } from '../../components/ui'
import { SelectField, TextField } from '../../components/fields'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../components/Toast'
import { ApiError, api, errorMessage, type TransactionFilters } from '../../lib/api'
import { impliedPrice } from '../../lib/calc'
import { DASH, TYPE_LABELS, formatBTC, formatDateTime, formatFiat } from '../../lib/format'
import { invalidateLedger, queryKeys, useDisplayCurrency } from '../../lib/queries'
import { TRANSACTION_TYPES, type Currency, type Transaction, type TransactionType } from '../../lib/types'
import { OverSellMessage } from './OverSellMessage'
import { isOverSellError } from './overSell'

const PAGE_SIZE = 20

function readFilters(params: URLSearchParams): TransactionFilters {
  const type = params.get('type')
  const page = Number(params.get('page'))
  return {
    type: TRANSACTION_TYPES.includes(type as TransactionType) ? (type as TransactionType) : undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE,
  }
}

export function TransactionsPage() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const rangeInvalid = !!(filters.from && filters.to && filters.from > filters.to)
  const currency = useDisplayCurrency()
  const [toDelete, setToDelete] = useState<Transaction | null>(null)

  const list = useQuery({
    queryKey: queryKeys.transactionList(filters),
    queryFn: () => api.listTransactions(filters),
    placeholderData: keepPreviousData,
    enabled: !rangeInvalid,
  })

  const setFilter = (key: 'type' | 'from' | 'to' | 'page', value: string | undefined) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: key !== 'page' },
    )
  }
  const hasFilters = !!(filters.type || filters.from || filters.to)

  return (
    <>
      <PageHeader
        title="Transactions"
        actions={
          <div className="hidden md:block">
            <LinkButton to="/transactions/new" variant="primary">
              <Plus className="size-4" aria-hidden /> Add transaction
            </LinkButton>
          </div>
        }
      />

      <Card className="mb-4">
        <form className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end" onSubmit={(e) => e.preventDefault()}>
          <SelectField
            label="Type"
            className="col-span-2 md:col-span-1"
            value={filters.type ?? ''}
            onChange={(e) => setFilter('type', e.target.value || undefined)}
          >
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="From"
            type="date"
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(e) => setFilter('from', e.target.value || undefined)}
            error={rangeInvalid ? '"From" must be on or before "To"' : undefined}
          />
          <TextField
            label="To"
            type="date"
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(e) => setFilter('to', e.target.value || undefined)}
          />
          {hasFilters && (
            <Button className="col-span-2 md:col-span-1" variant="ghost" onClick={() => setParams({}, { replace: true })}>
              <X className="size-4" aria-hidden /> Clear filters
            </Button>
          )}
        </form>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Dates are in UTC, matching the server.</p>
      </Card>

      {rangeInvalid ? null : list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState title="Couldn't load transactions" error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.data.length === 0 && list.data.total > 0 ? (
        <Card className="py-10 text-center">
          <p className="font-semibold">This page is empty.</p>
          <Button className="mt-4" onClick={() => setFilter('page', undefined)}>
            Go to the first page
          </Button>
        </Card>
      ) : list.data.total === 0 ? (
        <Card className="py-10 text-center">
          <p className="font-semibold">{hasFilters ? 'No transactions match these filters' : 'No transactions yet'}</p>
          {!hasFilters && (
            <LinkButton to="/transactions/new" variant="primary" className="mt-4">
              <Plus className="size-4" aria-hidden /> Add your first purchase
            </LinkButton>
          )}
        </Card>
      ) : (
        <div aria-busy={list.isFetching}>
          <TransactionTable rows={list.data.data} currency={currency} onDelete={setToDelete} />
          <TransactionCards rows={list.data.data} currency={currency} onDelete={setToDelete} />
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={(p) => setFilter('page', String(p))}
          />
        </div>
      )}

      <DeleteDialog transaction={toDelete} onClose={() => setToDelete(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------

function priceLines(t: Transaction, currency: Currency) {
  const own = impliedPrice(t)
  const converted = currency !== t.fiatCurrency ? impliedPrice(t, currency) : null
  return {
    main: own ? formatFiat(own, t.fiatCurrency) : DASH,
    alt: converted ? `≈ ${formatFiat(converted, currency)}` : null,
  }
}

interface RowsProps {
  rows: Transaction[]
  currency: Currency
  onDelete: (t: Transaction) => void
}

function TransactionTable({ rows, currency, onDelete }: RowsProps) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block dark:border-slate-800 dark:bg-slate-900">
      <table className="tabular w-full text-sm">
        <caption className="sr-only">Transactions, newest first</caption>
        <thead className="border-b border-slate-200 text-left text-xs font-medium text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <tr>
            <th scope="col" className="px-4 py-3">Date</th>
            <th scope="col" className="px-4 py-3">Type</th>
            <th scope="col" className="px-4 py-3 text-right">BTC</th>
            <th scope="col" className="px-4 py-3 text-right">Amount</th>
            <th scope="col" className="px-4 py-3 text-right">Fee</th>
            <th scope="col" className="px-4 py-3 text-right">Price / BTC</th>
            <th scope="col" className="px-4 py-3">Exchange</th>
            <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((t) => {
            const price = priceLines(t, currency)
            return (
              <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(t.date)}</td>
                <td className="px-4 py-3"><TypeBadge type={t.type} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium">{formatBTC(t.btc)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatFiat(t.fiatAmount, t.fiatCurrency)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-slate-600 dark:text-slate-400">
                  {formatFiat(t.feeAmount, t.fiatCurrency)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {price.main}
                  {price.alt && <div className="text-xs text-slate-500 dark:text-slate-400">{price.alt}</div>}
                </td>
                <td className="max-w-40 truncate px-4 py-3" title={t.exchange ?? undefined}>{t.exchange ?? DASH}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  <RowActions t={t} onDelete={onDelete} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TransactionCards({ rows, currency, onDelete }: RowsProps) {
  return (
    <ul className="space-y-3 md:hidden" aria-label="Transactions, newest first">
      {rows.map((t) => {
        const price = priceLines(t, currency)
        return (
          <li key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col items-start gap-1">
                <TypeBadge type={t.type} />
                <span className="text-xs text-slate-600 dark:text-slate-400">{formatDateTime(t.date)}</span>
              </div>
              <RowActions t={t} onDelete={onDelete} />
            </div>
            <dl className="tabular mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-600 dark:text-slate-400">BTC</dt>
                <dd className="font-semibold">{formatBTC(t.btc)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-600 dark:text-slate-400">Amount</dt>
                <dd className="font-semibold">{formatFiat(t.fiatAmount, t.fiatCurrency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-600 dark:text-slate-400">Price / BTC</dt>
                <dd>
                  {price.main}
                  {price.alt && <span className="block text-xs text-slate-500 dark:text-slate-400">{price.alt}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-600 dark:text-slate-400">Fee</dt>
                <dd>{formatFiat(t.feeAmount, t.fiatCurrency)}</dd>
              </div>
              {t.exchange && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-600 dark:text-slate-400">Exchange</dt>
                  <dd className="break-words">{t.exchange}</dd>
                </div>
              )}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}

function RowActions({ t, onDelete }: { t: Transaction; onDelete: (t: Transaction) => void }) {
  const what = `${TYPE_LABELS[t.type].toLowerCase()} of ${formatBTC(t.btc)} on ${formatDateTime(t.date)}`
  return (
    <div className="flex items-center gap-1">
      <Link
        to={`/transactions/${t.id}/edit`}
        className="grid size-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        aria-label={`Edit ${what}`}
        title="Edit"
      >
        <Pencil className="size-4" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={() => onDelete(t)}
        className="grid size-11 place-items-center rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-slate-300 dark:hover:bg-red-950/50 dark:hover:text-red-400"
        aria-label={`Delete ${what}`}
        title="Delete"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  )
}

function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = Math.min(total, (page - 1) * pageSize + 1)
  const last = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {first}–{last} of {total}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <span className="flex items-center px-1 text-sm text-slate-600 dark:text-slate-400" aria-current="page">
          {page} / {pages}
        </span>
        <Button onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  )
}

function DeleteDialog({ transaction, onClose }: { transaction: Transaction | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const del = useMutation({
    mutationFn: (id: number) => api.deleteTransaction(id),
    onSuccess: async () => {
      await invalidateLedger(queryClient)
      toast.success('Transaction deleted')
      close()
    },
  })

  const close = () => {
    del.reset()
    onClose()
  }

  const overSell = del.error && isOverSellError(del.error) ? del.error : null

  return (
    <ConfirmDialog
      open={transaction !== null}
      title="Delete this transaction?"
      confirmLabel="Delete"
      busy={del.isPending}
      canConfirm={!overSell}
      onConfirm={() => transaction && del.mutate(transaction.id)}
      onClose={close}
    >
      {transaction && (
        <p>
          {TYPE_LABELS[transaction.type]} of <strong>{formatBTC(transaction.btc)}</strong> for{' '}
          <strong>{formatFiat(transaction.fiatAmount, transaction.fiatCurrency)}</strong> on{' '}
          {formatDateTime(transaction.date)}. This can't be undone.
        </p>
      )}
      {overSell ? (
        <OverSellMessage error={overSell} currentId={transaction?.id} action="delete" />
      ) : (
        del.error && (
          <p role="alert" className="font-medium text-red-700 dark:text-red-400">
            {del.error instanceof ApiError && del.error.status === 404
              ? 'This transaction no longer exists.'
              : errorMessage(del.error)}
          </p>
        )
      )}
    </ConfirmDialog>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading transactions">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-20 md:h-12" />
      ))}
    </div>
  )
}
