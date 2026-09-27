import { describe, it, expect } from 'vitest';
import { setupApi } from '../helpers/api.js';
import {
  WORKED_TRANSACTIONS,
  WORKED_PRICE,
  EXPECTED_AVERAGE,
  EXPECTED_FIFO,
} from '../fixtures/workedExample.js';

const api = setupApi();

async function insertWorkedExample() {
  for (const t of WORKED_TRANSACTIONS) {
    const res = await api.post('/transactions', t);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }
}

describe('GET /portfolio/summary', () => {
  it('is empty with no transactions and no price', async () => {
    const res = await api.get('/portfolio/summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      costMethod: 'AVERAGE',
      transactionCount: 0,
      holdings: { sats: '0', btc: '0.00000000' },
      price: null,
    });
    expect(res.body.USD.currentValue).toBeNull();
  });

  it('returns null price-dependent fields before any price snapshot exists', async () => {
    await insertWorkedExample();
    const { body } = await api.get('/portfolio/summary');

    expect(body.price).toBeNull();
    expect(body.TZS).toMatchObject({
      invested: EXPECTED_AVERAGE.TZS.invested,
      realizedPnl: EXPECTED_AVERAGE.TZS.realizedPnl,
      currentValue: null,
      unrealizedPnl: null,
      unrealizedPnlPct: null,
      totalPnl: null,
    });
  });

  it('matches the worked example once a price snapshot exists (AVERAGE)', async () => {
    await insertWorkedExample();
    await api.prisma.priceSnapshot.create({
      data: { btcUsd: '50000', usdTzs: '2500', timestamp: new Date('2026-04-01T00:00:00Z') },
    });
    await api.prisma.priceSnapshot.create({
      data: { ...WORKED_PRICE, timestamp: new Date('2026-04-02T00:00:00Z') }, // latest wins
    });

    const { body } = await api.get('/portfolio/summary');
    expect(body.costMethod).toBe('AVERAGE');
    expect(body.transactionCount).toBe(3);
    expect(body.holdings).toEqual(EXPECTED_AVERAGE.holdings);
    expect(body.price).toEqual({
      btcUsd: '110000.00',
      usdTzs: '2700.0000',
      btcTzs: '297000000.00',
      timestamp: '2026-04-02T00:00:00.000Z',
      stale: true,
    });
    expect(body.TZS).toEqual(EXPECTED_AVERAGE.TZS);
    expect(body.USD).toEqual(EXPECTED_AVERAGE.USD);
  });

  it('switches from AVERAGE to FIFO when the setting changes', async () => {
    await insertWorkedExample();
    await api.prisma.priceSnapshot.create({ data: WORKED_PRICE });

    const before = await api.get('/portfolio/summary');
    expect(before.body.TZS.realizedPnl).toBe(EXPECTED_AVERAGE.TZS.realizedPnl);

    const patched = await api.patch('/settings', { costMethod: 'FIFO' });
    expect(patched.status).toBe(200);

    const after = await api.get('/portfolio/summary');
    expect(after.body.costMethod).toBe('FIFO');
    expect(after.body.TZS).toMatchObject(EXPECTED_FIFO.TZS);
    expect(after.body.USD).toMatchObject(EXPECTED_FIFO.USD);
  });
});

describe('GET /portfolio/ledger', () => {
  it('returns running values oldest first', async () => {
    await insertWorkedExample();
    const res = await api.get('/portfolio/ledger');

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.date.slice(0, 10))).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(res.body.map((r) => r.holdingsSats)).toEqual(['1000000', '1500000', '1200000']);
    expect(res.body[2].TZS).toMatchObject({ costOfSold: '820120.00', realizedPnl: '46430.00' });
    expect(res.body[2].USD).toMatchObject({ costOfSold: '323.20', realizedPnl: '3.80' });
    expect(res.body[0].TZS.costOfSold).toBeNull();
  });

  it('uses the configured cost method', async () => {
    await insertWorkedExample();
    await api.patch('/settings', { costMethod: 'FIFO' });
    const res = await api.get('/portfolio/ledger');
    expect(res.body[2].TZS.costOfSold).toBe('757500.00');
  });
});

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const res = await api.get('/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ displayCurrency: 'TZS', costMethod: 'AVERAGE' });
  });

  it('updates one or both settings', async () => {
    expect((await api.patch('/settings', { displayCurrency: 'USD' })).body).toEqual({
      displayCurrency: 'USD',
      costMethod: 'AVERAGE',
    });
    expect((await api.patch('/settings', { displayCurrency: 'TZS', costMethod: 'FIFO' })).body).toEqual({
      displayCurrency: 'TZS',
      costMethod: 'FIFO',
    });
    expect((await api.get('/settings')).body).toEqual({ displayCurrency: 'TZS', costMethod: 'FIFO' });
  });

  it('rejects invalid values, unknown keys and empty bodies', async () => {
    expect((await api.patch('/settings', { costMethod: 'LIFO' })).status).toBe(400);
    expect((await api.patch('/settings', { displayCurrency: 'EUR' })).status).toBe(400);
    expect((await api.patch('/settings', { theme: 'dark' })).status).toBe(400);
    expect((await api.patch('/settings', {})).status).toBe(400);
  });
});
