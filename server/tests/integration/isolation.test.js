import { describe, it, expect } from 'vitest';
import { setupApi } from '../helpers/api.js';

const api = setupApi();

const buy = (overrides = {}) => ({
  type: 'BUY',
  date: '2026-01-10T00:00:00Z',
  sats: 1_000_000,
  fiatAmount: '2500000',
  feeAmount: '25000',
  fiatCurrency: 'TZS',
  usdTzsRate: '2500',
  ...overrides,
});

describe('cross-user data isolation', () => {
  it("a second user can't see, fetch, patch or delete another user's transactions", async () => {
    const created = await api.post('/transactions', buy());
    expect(created.status).toBe(201);
    const txId = created.body.id;

    const other = await api.createUser({ email: 'other@example.com' });

    const list = await other.get('/transactions');
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([]);

    expect((await other.get(`/transactions/${txId}`)).status).toBe(404);
    expect((await other.patch(`/transactions/${txId}`, { note: 'nope' })).status).toBe(404);
    expect((await other.del(`/transactions/${txId}`)).status).toBe(404);

    // Original owner still sees it, untouched.
    const stillThere = await api.get(`/transactions/${txId}`);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.note).not.toBe('nope');
  });

  it('two users can hold conflicting settings without affecting each other', async () => {
    const other = await api.createUser({ email: 'settings-other@example.com' });

    const mine = await api.patch('/settings', { displayCurrency: 'USD', costMethod: 'FIFO' });
    expect(mine.status).toBe(200);
    const theirs = await other.patch('/settings', { displayCurrency: 'TZS', costMethod: 'AVERAGE' });
    expect(theirs.status).toBe(200);

    expect((await api.get('/settings')).body).toMatchObject({ displayCurrency: 'USD', costMethod: 'FIFO' });
    expect((await other.get('/settings')).body).toMatchObject({ displayCurrency: 'TZS', costMethod: 'AVERAGE' });
  });

  it("a sell that would exceed one user's holdings doesn't see another user's buys", async () => {
    const other = await api.createUser({ email: 'ledger-other@example.com' });
    await other.post('/transactions', buy({ sats: 5_000_000 }));

    // I have no transactions of my own, so any sell must be rejected.
    const res = await api.post('/transactions', {
      type: 'SELL',
      date: '2026-01-11T00:00:00Z',
      sats: 100_000,
      fiatAmount: '100',
      fiatCurrency: 'USD',
      usdTzsRate: '2650',
    });
    expect(res.status).toBe(422);
  });
});
