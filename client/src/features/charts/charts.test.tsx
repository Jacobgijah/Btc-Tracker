import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptySummary, mockApi, renderApp, settings, summary, type MockRequest } from '../../test/utils'
import type { HistoryPoint, MonthlyReport, PortfolioHistory, PortfolioSummary } from '../../lib/types'

const summaryWithFx: PortfolioSummary = {
  ...summary,
  TZS: { ...summary.TZS, btcEffect: '73440.00', fxEffect: '210080.00' },
}

const point = (date: string, extra: Partial<HistoryPoint> = {}): HistoryPoint => ({
  date,
  holdingsSats: '1000000',
  btcUsd: '100000.00',
  usdTzs: '2500.0000',
  priceSource: 'daily',
  transactionCount: 0,
  btcPrice: '250000000.00',
  costBasis: '2525000.00',
  currentValue: '2500000.00',
  unrealizedPnl: '-25000.00',
  unrealizedPnlPct: '-0.99',
  realizedPnlCumulative: '0.00',
  avgCostPerBtc: '252500000.00',
  investedThatDay: '0.00',
  ...extra,
})

function history(req: MockRequest, overrides: Partial<PortfolioHistory> = {}): PortfolioHistory {
  return {
    range: (req.query.get('range') ?? 'ALL') as PortfolioHistory['range'],
    currency: (req.query.get('currency') ?? 'TZS') as PortfolioHistory['currency'],
    costMethod: 'AVERAGE',
    timeZone: 'Africa/Dar_es_Salaam',
    from: '2026-01-10',
    to: '2026-01-12',
    totalDays: 3,
    pointCount: 3,
    downsampled: false,
    daysWithCarriedForwardPrices: 0,
    daysWithoutPrice: 0,
    points: [
      point('2026-01-10', { transactionCount: 1 }),
      point('2026-01-11', { priceSource: 'carried_forward' }),
      point('2026-01-12'),
    ],
    ...overrides,
  }
}

const monthly: MonthlyReport = {
  currency: 'TZS',
  timeZone: 'Africa/Dar_es_Salaam',
  months: [
    {
      month: '2026-01',
      satsAcquired: '1000000',
      satsSold: '0',
      buyCount: 1,
      sellCount: 0,
      transferInCount: 0,
      invested: '2525000.00',
      received: '0.00',
      avgBuyPrice: '252500000.00',
    },
  ],
  summary: { monthsSaved: 1, currentStreak: 1, totalInvested: '2525000.00', averagePerMonth: '2525000.00' },
}

const emptyMonthly: MonthlyReport = {
  ...monthly,
  months: [],
  summary: { monthsSaved: 0, currentStreak: 0, totalInvested: '0.00', averagePerMonth: null },
}

function mockCharts({
  portfolio = summaryWithFx,
  historyOverrides = {},
  monthlyReport = monthly,
}: {
  portfolio?: PortfolioSummary
  historyOverrides?: Partial<PortfolioHistory>
  monthlyReport?: MonthlyReport
} = {}) {
  return mockApi({
    'GET /settings': { body: settings },
    'PATCH /settings': (req) => ({ body: { ...settings, ...(req.body as object) } }),
    'GET /portfolio/summary': { body: portfolio },
    'GET /portfolio/history': (req) => ({ body: history(req, historyOverrides) }),
    'GET /portfolio/monthly': (req) => ({ body: { ...monthlyReport, currency: req.query.get('currency') } }),
    'GET /portfolio/ledger': { body: [] },
    'GET /transactions': { body: { data: [], page: 1, pageSize: 5, total: 0 } },
  })
}

const historyCalls = (calls: MockRequest[]) =>
  calls.filter((c) => c.path === '/portfolio/history').map((c) => `${c.query.get('range')} ${c.query.get('currency')}`)

describe('Charts page', () => {
  it('shows every chart and asks for the display currency', async () => {
    const { calls } = mockCharts()
    renderApp('/charts')

    for (const name of ['Value vs cost basis', 'BTC price vs your average cost', 'Holdings over time', 'Monthly savings']) {
      expect(await screen.findByRole('region', { name })).toBeInTheDocument()
    }
    await waitFor(() => expect(historyCalls(calls)).toContain('ALL TZS'))
    expect(await screen.findByText(/saved in 1 month · TSh 2,525,000 a month on average · current streak: 1 month/i)).toBeInTheDocument()
  })

  it('refetches a chart when its range changes', async () => {
    const { calls } = mockCharts()
    const user = userEvent.setup()
    renderApp('/charts')

    const card = await screen.findByRole('region', { name: 'Value vs cost basis' })
    const allRange = within(card).getByRole('radio', { name: 'ALL' })
    expect(allRange).toBeChecked()

    await user.click(within(card).getByRole('radio', { name: '3M' }))

    expect(within(card).getByRole('radio', { name: '3M' })).toBeChecked()
    await waitFor(() => expect(historyCalls(calls)).toContain('3M TZS'))
    // Other charts keep their own range.
    const holdings = screen.getByRole('region', { name: 'Holdings over time' })
    expect(within(holdings).getByRole('radio', { name: 'ALL' })).toBeChecked()
  })

  it('shows the FX effect card in TZS only', async () => {
    const { calls } = mockCharts()
    const user = userEvent.setup()
    renderApp('/charts')

    const card = await screen.findByRole('region', { name: /where your shilling profit comes from/i })
    expect(within(card).getByText('+TSh 73,440')).toBeInTheDocument()
    expect(within(card).getByText('+TSh 210,080')).toBeInTheDocument()
    expect(within(card).getByText('+TSh 283,520')).toBeInTheDocument()
    expect(within(card).getByText(/if bitcoin's dollar price hadn't moved/i)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'USD' }))

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /where your shilling profit comes from/i })).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(historyCalls(calls)).toContain('ALL USD'))
  })

  it('explains the FX split needs a price', async () => {
    mockCharts({ portfolio: { ...summaryWithFx, TZS: { ...summaryWithFx.TZS, btcEffect: null, fxEffect: null } } })
    renderApp('/charts')
    expect(await screen.findByText(/needs a btc price/i)).toBeInTheDocument()
  })

  it('shows empty states without transactions', async () => {
    mockCharts({
      portfolio: { ...emptySummary, TZS: { ...emptySummary.TZS, btcEffect: null, fxEffect: null } },
      historyOverrides: { from: null, totalDays: 0, pointCount: 0, points: [] },
      monthlyReport: emptyMonthly,
    })
    renderApp('/charts')

    await waitFor(() => expect(screen.getAllByText('Add a few transactions to see your history.')).toHaveLength(4))
    expect(screen.getAllByRole('link', { name: /add a transaction/i })[0]).toHaveAttribute('href', '/transactions/new')
    // No FX split without holdings
    expect(screen.queryByRole('region', { name: /where your shilling profit comes from/i })).not.toBeInTheDocument()
  })

  it('notes carried-forward prices', async () => {
    mockCharts({ historyOverrides: { daysWithCarriedForwardPrices: 1, daysWithoutPrice: 2 } })
    renderApp('/charts')
    const card = await screen.findByRole('region', { name: 'Value vs cost basis' })
    expect(
      await within(card).findByText('1 of 3 days use a price carried forward from an earlier day; 2 days have no price yet.'),
    ).toBeInTheDocument()
  })

  it('shows an error with retry when history fails', async () => {
    mockApi({
      'GET /settings': { body: settings },
      'GET /portfolio/summary': { body: summaryWithFx },
      'GET /portfolio/history': { status: 500, body: { error: 'Internal server error' } },
      'GET /portfolio/monthly': { body: monthly },
      'GET /portfolio/ledger': { body: [] },
    })
    renderApp('/charts')
    const card = await screen.findByRole('region', { name: 'Value vs cost basis' })
    expect(await within(card).findByText("Couldn't load this chart")).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('Dashboard charts section', () => {
  it('shows the FX split and the main charts with a link to all charts', async () => {
    mockCharts()
    renderApp('/')

    const section = await screen.findByRole('region', { name: 'Charts' })
    expect(within(section).getByRole('link', { name: /all charts/i })).toHaveAttribute('href', '/charts')
    expect(await within(section).findByRole('region', { name: 'Value vs cost basis' })).toBeInTheDocument()
    expect(within(section).getByRole('region', { name: 'BTC price vs your average cost' })).toBeInTheDocument()
    expect(within(section).getByRole('region', { name: /where your shilling profit comes from/i })).toBeInTheDocument()
  })
})
