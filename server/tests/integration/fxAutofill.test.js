import { describe, it, expect, vi } from 'vitest';
import { setupApi } from '../helpers/api.js';
import { routeFetch, callsTo, json, MATCH } from '../helpers/fetchMock.js';

const api = setupApi();

const HOUR = 60 * 60 * 1000;

// A BUY without usdTzsRate.
const buy = (overrides = {}) => ({
  type: 'BUY',
  date: '2026-01-10T00:00:00Z',
  sats: 100_000,
  fiatAmount: '250000',
  fiatCurrency: 'TZS',
  ...overrides,
});

const snapshot = (data = {}) =>
  api.prisma.priceSnapshot.create({ data: { btcUsd: '84721', usdTzs: '2656.3489', ...data } });

describe('usdTzsRate auto-fill on POST /transactions', () => {
  it('uses the latest snapshot for a transaction in the last 24h', async () => {
    await snapshot();
    const res = await api.post('/transactions', buy({ date: new Date(Date.now() - 2 * HOUR).toISOString() }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ usdTzsRate: '2656.3489', usdTzsRateSource: 'latest_snapshot' });
    expect(fetch).not.toHaveBeenCalled();
    const stored = await api.prisma.transaction.findUnique({ where: { id: res.body.id } });
    expect(stored.usdTzsRate.toFixed(4)).toBe('2656.3489');
  });

  it('looks up the historical rate for an older date, caching by date', async () => {
    const fetchMock = routeFetch({
      [MATCH.dated('2026-01-10')]: { date: '2026-01-10', usd: { tzs: 2498.62509244 } },
    });

    const first = await api.post('/transactions', buy());
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ usdTzsRate: '2498.6251', usdTzsRateSource: 'historical_lookup' });

    const second = await api.post('/transactions', buy({ date: '2026-01-10T15:30:00Z' }));
    expect(second.body.usdTzsRate).toBe('2498.6251');
    expect(callsTo(fetchMock, '2026-01-10')).toBe(1);
  });

  it('falls back to an earlier day when the exact date was not published', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    routeFetch({
      [MATCH.dated('2026-01-10')]: () => json({}, 404),
      [MATCH.dated('2026-01-09')]: { date: '2026-01-09', usd: { tzs: 2497.5 } },
    });
    const res = await api.post('/transactions', buy());
    expect(res.body).toMatchObject({ usdTzsRate: '2497.5000', usdTzsRateSource: 'historical_lookup' });
  });

  it('uses a historical lookup for a recent date when the latest snapshot is over 24h old', async () => {
    await snapshot({ usdTzs: '2000', timestamp: new Date(Date.now() - 48 * HOUR) });
    const today = new Date().toISOString().slice(0, 10);
    routeFetch({ [MATCH.dated(today)]: { date: today, usd: { tzs: 2650.1 } } });

    const res = await api.post('/transactions', buy({ date: new Date(Date.now() - HOUR).toISOString() }));
    expect(res.body).toMatchObject({ usdTzsRate: '2650.1000', usdTzsRateSource: 'historical_lookup' });
  });

  it('422s asking for a manual rate when none can be found, and writes nothing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = routeFetch({ '@fawazahmed0/currency-api@': () => json({ error: 'nope' }, 404) });

    const res = await api.post('/transactions', buy({ date: '2023-06-01' }));

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: "Couldn't find a USD/TZS rate for 2023-06-01. Please enter usdTzsRate manually.",
      details: { field: 'usdTzsRate', date: '2023-06-01' },
    });
    expect(callsTo(fetchMock, '@fawazahmed0')).toBe(4); // the date + 3 earlier days
    expect(await api.prisma.transaction.count()).toBe(0);
  });

  it('422s when the lookup fails on the network too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The default test fetch throws for every URL.
    const res = await api.post('/transactions', buy());
    expect(res.status).toBe(422);
  });

  it('always uses a rate I provide myself', async () => {
    await snapshot();
    const res = await api.post('/transactions', buy({ usdTzsRate: '2400.5' }));
    expect(res.body).toMatchObject({ usdTzsRate: '2400.5000', usdTzsRateSource: 'provided' });

    const recent = await api.post(
      '/transactions',
      buy({ usdTzsRate: '2401', date: new Date(Date.now() - HOUR).toISOString() }),
    );
    expect(recent.body).toMatchObject({ usdTzsRate: '2401.0000', usdTzsRateSource: 'provided' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still validates a provided rate', async () => {
    const res = await api.post('/transactions', buy({ usdTzsRate: '0' }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty('usdTzsRate');
  });

  it('runs the over-sell check with the looked-up rate', async () => {
    routeFetch({ [MATCH.dated('2026-01-10')]: { date: '2026-01-10', usd: { tzs: 2500 } } });
    const res = await api.post('/transactions', buy({ type: 'SELL' }));
    expect(res.status).toBe(422);
    expect(res.body.details).toMatchObject({ transactionId: null, availableSats: '0' });
  });
});
