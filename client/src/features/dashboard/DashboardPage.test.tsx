import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buyTx, emptySummary, mockApi, renderApp, settings, summary } from '../../test/utils'

const list = { data: [buyTx], page: 1, pageSize: 5, total: 1 }

describe('Dashboard', () => {
  it('shows a call to action for a new user', async () => {
    mockApi({ 'GET /settings': { body: settings }, 'GET /portfolio/summary': { body: emptySummary } })
    renderApp('/')

    const cta = await screen.findByRole('link', { name: /add your first purchase/i })
    expect(cta).toHaveAttribute('href', '/transactions/new')
    expect(screen.getByText(/no price fetched yet/i)).toBeInTheDocument()
  })

  it('shows dashes and an explanation when there is no price yet', async () => {
    const noPrice = {
      ...summary,
      price: null,
      TZS: { ...summary.TZS, currentValue: null, unrealizedPnl: null, unrealizedPnlPct: null, totalPnl: null },
      USD: { ...summary.USD, currentValue: null, unrealizedPnl: null, unrealizedPnlPct: null, totalPnl: null },
    }
    mockApi({
      'GET /settings': { body: settings },
      'GET /portfolio/summary': { body: noPrice },
      'GET /transactions': { body: list },
    })
    renderApp('/')

    const value = await screen.findByRole('region', { name: 'Current value' })
    expect(within(value).getByText('—')).toBeInTheDocument()
    expect(within(value).getByText(/no btc price yet/i)).toBeInTheDocument()
    expect(within(value).queryByText(/TSh 0/)).not.toBeInTheDocument()
    expect(screen.getByText('Needs a BTC price')).toBeInTheDocument()
    // cost figures don't need a price
    expect(screen.getByText('TSh 3,280,480')).toBeInTheDocument()
  })

  it('shows value and signed, coloured P/L in the chosen currency', async () => {
    mockApi({
      'GET /settings': { body: settings },
      'GET /portfolio/summary': { body: summary },
      'GET /transactions': { body: list },
      'PATCH /settings': (req) => ({ body: { ...settings, ...(req.body as object) } }),
    })
    const user = userEvent.setup()
    renderApp('/')

    const value = await screen.findByRole('region', { name: 'Current value' })
    expect(within(value).getByText('TSh 3,564,000')).toBeInTheDocument()
    // Gain: gold, "+" sign and a ▲ icon, so it isn't colour alone
    const pnl = within(value).getByText('+TSh 283,520')
    expect(pnl.className).toMatch(/\btext-gain\b/)
    expect(pnl.querySelector('svg path')?.getAttribute('d')).toMatch(/^M5 1\.5/) // ▲
    expect(within(value).getByText('(+8.64%)')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'USD' }))
    expect(await within(value).findByText('$1,320.00')).toBeInTheDocument()
    expect(within(value).getByText('+$27.20')).toBeInTheDocument()
  })

  it('shows an error with a retry button when the summary fails', async () => {
    let fail = true
    mockApi({
      'GET /settings': { body: settings },
      'GET /portfolio/summary': () =>
        fail ? { status: 500, body: { error: 'Internal server error' } } : { body: emptySummary },
    })
    const user = userEvent.setup()
    renderApp('/')

    expect(await screen.findByText(/couldn't load your portfolio/i)).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('link', { name: /add your first purchase/i })).toBeInTheDocument()
  })
})
