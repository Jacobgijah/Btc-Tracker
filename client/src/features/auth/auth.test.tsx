import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getToken } from '../../lib/api'
import { mockApi, renderApp, settings } from '../../test/utils'

const emptyList = { data: [], page: 1, pageSize: 20, total: 0 }

describe('authentication', () => {
  it('redirects to /login when there is no token', async () => {
    mockApi({})
    renderApp('/settings', { token: null })
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('on a 401 clears the token, goes to /login, and returns to the same page after logging in', async () => {
    let loggedIn = false
    const { calls } = mockApi({
      'GET /settings': () => (loggedIn ? { body: settings } : { status: 401, body: { error: 'Invalid or expired token' } }),
      'GET /transactions': () =>
        loggedIn ? { body: emptyList } : { status: 401, body: { error: 'Invalid or expired token' } },
      'POST /auth/login': () => {
        loggedIn = true
        return { body: { token: 'fresh-token', user: { id: 1, email: 'me@example.com' } } }
      },
    })
    const user = userEvent.setup()
    renderApp('/transactions?type=SELL', { token: 'expired-token' })

    // Kicked out to the login page, token gone.
    const email = await screen.findByLabelText('Email')
    expect(getToken()).toBeNull()

    await user.type(email, 'me@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // Back where we were, with the filter preserved and the new token used.
    expect(await screen.findByRole('heading', { name: 'Transactions' })).toBeInTheDocument()
    expect(getToken()).toBe('fresh-token')
    const lastList = calls.filter((c) => c.path === '/transactions').at(-1)!
    expect(lastList.query.get('type')).toBe('SELL')
    expect(lastList.headers.Authorization).toBe('Bearer fresh-token')
  })

  it("shows the server's error message on a failed login", async () => {
    mockApi({
      'POST /auth/login': { status: 429, body: { error: 'Too many login attempts, please try again later' } },
    })
    const user = userEvent.setup()
    renderApp('/login', { token: null })

    await user.type(screen.getByLabelText('Email'), 'me@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many login attempts, please try again later')
  })
})
