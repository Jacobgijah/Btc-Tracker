import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button, Card } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { ApiError, api, errorMessage } from '../../lib/api'
import { formatRate, formatRelativeTime, formatTZS, formatUSD } from '../../lib/format'
import { queryKeys } from '../../lib/queries'
import { useNow } from '../../lib/useNow'
import type { PriceSnapshot } from '../../lib/types'

// POST /prices/refresh allows one request per minute.
const REFRESH_COOLDOWN_MS = 60_000

export function PriceCard({ price }: { price: PriceSnapshot | null }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const now = useNow(1000)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  const refresh = useMutation({
    mutationFn: api.refreshPrices,
    onSuccess: async () => {
      setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS)
      await queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
      toast.success('Prices updated')
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 429) {
        setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS)
        toast.error(`${errorMessage(err)}. Try again in a minute.`)
      } else {
        toast.error(`Couldn't refresh prices: ${errorMessage(err)}`)
      }
    },
  })

  return (
    <Card aria-labelledby="price-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="price-heading" className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Bitcoin price
          </h2>
          {price ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <time dateTime={price.timestamp} title={new Date(price.timestamp).toLocaleString()}>
                Updated {formatRelativeTime(price.timestamp, now)}
              </time>
              {price.stale && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  Stale
                </span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">No price fetched yet</p>
          )}
        </div>
        <Button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || cooldownLeft > 0}
          aria-label={cooldownLeft > 0 ? `Refresh available in ${cooldownLeft} seconds` : 'Refresh prices'}
          className="shrink-0"
        >
          <RefreshCw className={refresh.isPending ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
          <span aria-hidden>{refresh.isPending ? 'Refreshing' : cooldownLeft > 0 ? `${cooldownLeft}s` : 'Refresh'}</span>
        </Button>
      </div>

      {price ? (
        <>
          {price.stale && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              This price is out of date, so value and P/L may be off. Refresh to fetch a new one.
            </p>
          )}
          <dl className="tabular mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-600 dark:text-slate-400">BTC / TZS</dt>
              <dd className="text-lg font-semibold">{formatTZS(price.btcTzs)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600 dark:text-slate-400">BTC / USD</dt>
              <dd className="text-lg font-semibold">{formatUSD(price.btcUsd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600 dark:text-slate-400">USD / TZS</dt>
              <dd className="text-lg font-semibold">{formatRate(price.usdTzs)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Prices are fetched automatically every few minutes while the server runs. Tap refresh to fetch one now.
        </p>
      )}
    </Card>
  )
}
