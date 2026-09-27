import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import { AppProviders } from '../providers'
import { createQueryClient } from '../lib/queryClient'
import { setToken } from '../lib/api'
import type { PortfolioSummary, Settings, Transaction } from '../lib/types'

export interface MockRequest {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  headers: Record<string, string>
}
type Reply = { status?: number; body?: unknown }
type Handler = Reply | ((req: MockRequest) => Reply)

/**
 * Replaces fetch with a tiny router: keys are "METHOD /path" (without the /api
 * prefix). Unmatched requests fail the test loudly with a 500.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: MockRequest[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost')
    const req: MockRequest = {
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname.replace(/^\/api/, ''),
      query: url.searchParams,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    }
    calls.push(req)
    const handler = routes[`${req.method} ${req.path}`]
    const reply: Reply = handler
      ? typeof handler === 'function'
        ? handler(req)
        : handler
      : { status: 500, body: { error: `No mock for ${req.method} ${req.path}` } }
    const status = reply.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export function renderApp(path: string, { token = 'test-token' }: { token?: string | null } = {}) {
  setToken(token)
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders client={client}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Fixtures (the README's worked example)

export const settings: Settings = { displayCurrency: 'TZS', costMethod: 'AVERAGE' }

export const summary: PortfolioSummary = {
  costMethod: 'AVERAGE',
  transactionCount: 3,
  holdings: { sats: '1200000', btc: '0.01200000' },
  price: {
    btcUsd: '110000.00',
    usdTzs: '2700.0000',
    btcTzs: '297000000.00',
    timestamp: new Date().toISOString(),
    stale: false,
  },
  USD: {
    invested: '1616.00',
    costBasis: '1292.80',
    avgCostPerBtc: '107733.33',
    realizedPnl: '3.80',
    currentValue: '1320.00',
    unrealizedPnl: '27.20',
    unrealizedPnlPct: '2.10',
    totalPnl: '31.00',
  },
  TZS: {
    invested: '4100600.00',
    costBasis: '3280480.00',
    avgCostPerBtc: '273373333.33',
    realizedPnl: '46430.00',
    currentValue: '3564000.00',
    unrealizedPnl: '283520.00',
    unrealizedPnlPct: '8.64',
    totalPnl: '329950.00',
  },
}

export const emptySummary: PortfolioSummary = {
  costMethod: 'AVERAGE',
  transactionCount: 0,
  holdings: { sats: '0', btc: '0.00000000' },
  price: null,
  USD: {
    invested: '0.00',
    costBasis: '0.00',
    avgCostPerBtc: null,
    realizedPnl: '0.00',
    currentValue: null,
    unrealizedPnl: null,
    unrealizedPnlPct: null,
    totalPnl: null,
  },
  TZS: {
    invested: '0.00',
    costBasis: '0.00',
    avgCostPerBtc: null,
    realizedPnl: '0.00',
    currentValue: null,
    unrealizedPnl: null,
    unrealizedPnlPct: null,
    totalPnl: null,
  },
}

export const buyTx: Transaction = {
  id: 1,
  type: 'BUY',
  date: '2026-01-10T00:00:00.000Z',
  sats: '1000000',
  btc: '0.01000000',
  fiatAmount: '2500000.00',
  feeAmount: '25000.00',
  fiatCurrency: 'TZS',
  usdTzsRate: '2500.0000',
  exchange: 'Binance',
  note: null,
}
