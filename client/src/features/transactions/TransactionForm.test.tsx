import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buyTx, mockApi, renderApp, settings, summary } from '../../test/utils'

const baseRoutes = {
  'GET /settings': { body: settings },
  'GET /portfolio/summary': { body: summary },
  'GET /prices/fx': (req: { query: URLSearchParams }) => ({
    body: { date: req.query.get('date'), usdTzs: '2656.3489', source: 'latest_snapshot', asOf: new Date().toISOString() },
  }),
  'GET /transactions': { body: { data: [], page: 1, pageSize: 20, total: 0 } },
}

const amountInput = () => screen.getByRole('textbox', { name: /bitcoin amount/i })

describe('Add transaction form', () => {
  it('pre-fills the USD/TZS rate from /prices/fx and says where it came from', async () => {
    const { calls } = mockApi(baseRoutes)
    renderApp('/transactions/new')

    const rate = await screen.findByRole('textbox', { name: /usd\/tzs rate/i })
    await waitFor(() => expect(rate).toHaveValue('2656.3489'))
    expect(screen.getByText(/from the latest price snapshot/i)).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/prices/fx' && /^\d{4}-\d{2}-\d{2}$/.test(c.query.get('date')!))).toBe(true)
  })

  it("never saves the previous date's rate after the date changes", async () => {
    const { calls } = mockApi({
      ...baseRoutes,
      'GET /prices/fx': (req) => {
        const date = req.query.get('date')!
        return date === '2026-06-15'
          ? { body: { date, usdTzs: '2621.5265', source: 'historical_lookup', asOf: date } }
          : { body: { date, usdTzs: '2656.3489', source: 'latest_snapshot', asOf: new Date().toISOString() } }
      },
      'POST /transactions': (req) => ({ status: 201, body: { ...buyTx, ...(req.body as object), id: 9 } }),
    })
    const user = userEvent.setup()
    renderApp('/transactions/new')

    const rate = await screen.findByRole('textbox', { name: /usd\/tzs rate/i })
    await waitFor(() => expect(rate).toHaveValue('2656.3489'))
    await user.type(amountInput(), '0.01')
    await user.type(screen.getByRole('textbox', { name: /amount paid/i }), '2500000')

    fireEvent.change(screen.getByLabelText(/date & time/i), { target: { value: '2026-06-15T10:00' } })
    // The old day's rate is still in the field, so saving is blocked until the lookup answers.
    expect(screen.getByRole('button', { name: /checking rate/i })).toBeDisabled()

    await waitFor(() => expect(rate).toHaveValue('2621.5265'))
    expect(screen.getByText(/published daily rate/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add transaction/i }))
    await screen.findByText('Transaction added')
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ usdTzsRate: '2621.5265' })
  })

  it('keeps a rate typed by the user', async () => {
    mockApi(baseRoutes)
    const user = userEvent.setup()
    renderApp('/transactions/new')

    const rate = await screen.findByRole('textbox', { name: /usd\/tzs rate/i })
    await waitFor(() => expect(rate).toHaveValue('2656.3489'))
    await user.clear(rate)
    await user.type(rate, '2700')
    expect(screen.getByText('Entered by you.')).toBeInTheDocument()
    expect(rate).toHaveValue('2700')
  })

  it('leaves the rate empty and asks for it when the lookup fails', async () => {
    mockApi({
      ...baseRoutes,
      'GET /prices/fx': { status: 404, body: { error: 'No USD/TZS rate found for 2026-09-27. Enter it manually.' } },
    })
    renderApp('/transactions/new')

    expect(await screen.findByText(/No USD\/TZS rate found for 2026-09-27/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /usd\/tzs rate/i })).toHaveValue('')
  })

  it('converts the amount when toggling between BTC and sats', async () => {
    mockApi(baseRoutes)
    const user = userEvent.setup()
    renderApp('/transactions/new')

    await user.type(amountInput(), '0.0125')
    await user.click(screen.getByRole('radio', { name: 'sats' }))
    expect(amountInput()).toHaveValue('1250000')
    expect(screen.getByText('= 0.01250000 BTC')).toBeInTheDocument()

    await user.clear(amountInput())
    await user.type(amountInput(), '123456789')
    await user.click(screen.getByRole('radio', { name: 'BTC' }))
    expect(amountInput()).toHaveValue('1.23456789')
  })

  it('shows validation errors that mirror the server rules', async () => {
    const { calls } = mockApi(baseRoutes)
    const user = userEvent.setup()
    renderApp('/transactions/new')

    await user.click(await screen.findByRole('radio', { name: /^sell/i }))
    await user.type(amountInput(), '0.123456789')
    await user.type(screen.getByRole('textbox', { name: /amount received/i }), '330')
    await user.type(screen.getByRole('textbox', { name: /^fee/i }), '330')
    await user.click(screen.getByRole('button', { name: /add transaction/i }))

    expect(await screen.findByText(/at most 8 decimal places/i)).toBeInTheDocument()
    expect(screen.getByText(/fee must be less than the amount received/i)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows current holdings on a sell and warns when selling more', async () => {
    mockApi(baseRoutes)
    const user = userEvent.setup()
    renderApp('/transactions/new')

    await user.click(await screen.findByRole('radio', { name: /^sell/i }))
    expect(await screen.findByText('0.01200000 BTC')).toBeInTheDocument()
    await user.type(amountInput(), '0.5')
    expect(screen.getByText(/more than you hold/i)).toBeInTheDocument()
  })

  it('explains a 422 over-sell from the server', async () => {
    mockApi({
      ...baseRoutes,
      'POST /transactions': {
        status: 422,
        body: {
          error: 'Sell of 50000000 sats on 2026-09-27 exceeds holdings of 1200000 sats at that point',
          details: { transactionId: null, date: '2026-09-27T10:00:00.000Z', attemptedSats: '50000000', availableSats: '1200000' },
        },
      },
    })
    const user = userEvent.setup()
    renderApp('/transactions/new')

    await user.click(await screen.findByRole('radio', { name: /^sell/i }))
    await user.type(amountInput(), '0.5')
    await user.type(screen.getByRole('textbox', { name: /amount received/i }), '1000')
    await waitFor(() => expect(screen.getByRole('textbox', { name: /usd\/tzs rate/i })).toHaveValue('2656.3489'))
    await user.click(screen.getByRole('button', { name: /add transaction/i }))

    const alert = await screen.findByText(/can't save: not enough btc/i)
    const box = alert.closest('[role="alert"]') as HTMLElement
    expect(within(box).getByText(/0\.50000000 BTC/)).toBeInTheDocument()
    expect(within(box).getByText(/0\.01200000 BTC you held/)).toBeInTheDocument()
  })

  it('sends a valid buy and returns to the list with a toast', async () => {
    const { calls } = mockApi({
      ...baseRoutes,
      'POST /transactions': (req) => ({ status: 201, body: { ...buyTx, ...(req.body as object), id: 9 } }),
    })
    const user = userEvent.setup()
    renderApp('/transactions/new')

    await user.type(await screen.findByRole('textbox', { name: /bitcoin amount/i }), '0.01')
    await user.type(screen.getByRole('textbox', { name: /amount paid/i }), '2500000')
    await user.type(screen.getByRole('textbox', { name: /^fee/i }), '25000')
    await waitFor(() => expect(screen.getByRole('textbox', { name: /usd\/tzs rate/i })).toHaveValue('2656.3489'))

    // live preview: total cost incl. fee
    expect(screen.getByText('TSh 2,525,000')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add transaction/i }))
    expect(await screen.findByText('Transaction added')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Transactions' })).toBeInTheDocument()

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toMatchObject({
      type: 'BUY',
      btc: '0.01',
      fiatAmount: '2500000',
      feeAmount: '25000',
      fiatCurrency: 'TZS',
      usdTzsRate: '2656.3489',
    })
  })
})
