import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getToken } from '../../lib/api'
import { mockApi, renderApp, settings } from '../../test/utils'

const routes = {
  'GET /settings': { body: settings },
  'GET /auth/me': { body: { id: 1, email: 'me@example.com' } },
}

describe('log out', () => {
  it('asks first; "No" keeps you signed in', async () => {
    mockApi(routes)
    const user = userEvent.setup()
    renderApp('/settings', { token: 'my-token' })

    // The header's icon button (the one with a tooltip; Settings has a labelled one too)
    const button = (await screen.findAllByRole('button', { name: 'Log out' })).find((b) => b.title === 'Log out')!
    expect(button).toHaveClass('cursor-pointer')
    await user.click(button)

    const dialog = await screen.findByRole('dialog', { name: 'Log out?' })
    const no = within(dialog).getByRole('button', { name: 'No' })
    expect(no).toHaveFocus() // the safe answer is the default
    await user.click(no)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(getToken()).toBe('my-token')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('"Yes, log out" signs you out and goes to the login page', async () => {
    mockApi(routes)
    const user = userEvent.setup()
    renderApp('/settings', { token: 'my-token' })

    // The Settings page's own button asks the same question.
    const settingsButton = (await screen.findAllByRole('button', { name: /log out/i })).find((b) =>
      b.textContent?.includes('Log out'),
    )!
    await user.click(settingsButton)
    const dialog = await screen.findByRole('dialog', { name: 'Log out?' })
    expect(getToken()).toBe('my-token') // nothing happens until you answer

    await user.click(within(dialog).getByRole('button', { name: 'Yes, log out' }))

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })
})
