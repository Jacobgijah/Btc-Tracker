import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupApi } from '../helpers/api.js';
import { signToken } from '../../src/middleware/auth.js';
import { WORKED_TRANSACTIONS, WORKED_PRICE, EXPECTED_AVERAGE } from '../fixtures/workedExample.js';

const api = setupApi();

// "Today" is 12 March 2026 (12:00 in Dar es Salaam), two days after the worked example's sell.
const TODAY = new Date('2026-03-12T09:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});

async function insertWorkedExample() {
  for (const t of WORKED_TRANSACTIONS) {
    const res = await api.post('/transactions', t);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }
}

const daily = (date, btcUsd, usdTzs, fxSource = 'currency-api') =>
  api.prisma.dailyPrice.create({
    data: { date: new Date(`${date}T00:00:00Z`), btcUsd, usdTzs, btcSource: 'coinbase', fxSource },
  });

async function seedPrices() {
  await daily('2026-01-10', '100000', '2500');
  await daily('2026-02-10', '95000', '2600', 'carried_forward');
  await api.prisma.priceSnapshot.create({ data: { ...WORKED_PRICE, timestamp: new Date('2026-03-12T08:00:00Z') } });
}

describe('GET /portfolio/history', () => {
  it('returns the daily series in the display currency, ending at the summary', async () => {
    await insertWorkedExample();
    await seedPrices();

    const res = await api.get('/portfolio/history?range=ALL');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      range: 'ALL',
      currency: 'TZS',
      costMethod: 'AVERAGE',
      timeZone: 'Africa/Dar_es_Salaam',
      from: '2026-01-10',
      to: '2026-03-12',
      totalDays: 62,
      pointCount: 62,
      downsampled: false,
      // Every day except 10 Jan (its own price) and today (live): 59 without a row, plus
      // 10 Feb whose FX was carried forward by the backfill.
      daysWithCarriedForwardPrices: 60,
      daysWithoutPrice: 0,
    });

    const [first] = res.body.points;
    expect(first).toEqual({
      date: '2026-01-10',
      holdingsSats: '1000000',
      btcUsd: '100000.00',
      usdTzs: '2500.0000',
      priceSource: 'daily',
      transactionCount: 1,
      btcPrice: '250000000.00',
      costBasis: '2525000.00',
      currentValue: '2500000.00',
      unrealizedPnl: '-25000.00',
      unrealizedPnlPct: '-0.99',
      realizedPnlCumulative: '0.00',
      avgCostPerBtc: '252500000.00',
      investedThatDay: '2525000.00',
    });

    const last = res.body.points.at(-1);
    const { body: summary } = await api.get('/portfolio/summary');
    expect(last).toMatchObject({
      date: '2026-03-12',
      priceSource: 'live',
      holdingsSats: summary.holdings.sats,
      costBasis: summary.TZS.costBasis,
      currentValue: summary.TZS.currentValue,
      unrealizedPnl: summary.TZS.unrealizedPnl,
      unrealizedPnlPct: summary.TZS.unrealizedPnlPct,
      realizedPnlCumulative: summary.TZS.realizedPnl,
      avgCostPerBtc: summary.TZS.avgCostPerBtc,
    });
    expect(last.currentValue).toBe(EXPECTED_AVERAGE.TZS.currentValue);
  });

  it('switches currency and range', async () => {
    await insertWorkedExample();
    await seedPrices();

    const usd = await api.get('/portfolio/history?range=1M&currency=USD');
    // Every day but today (live) reuses the 10 Feb price: 28 carried forward (the README example)
    expect(usd.body).toMatchObject({
      currency: 'USD',
      from: '2026-02-12',
      to: '2026-03-12',
      totalDays: 29,
      daysWithCarriedForwardPrices: 28,
    });
    const tzs = await api.get('/portfolio/history?range=1M&currency=TZS');
    expect(tzs.body.points.find((p) => p.date === '2026-03-10')).toEqual({
      date: '2026-03-10',
      holdingsSats: '1200000',
      btcUsd: '95000.00',
      usdTzs: '2600.0000',
      priceSource: 'carried_forward',
      transactionCount: 1,
      btcPrice: '247000000.00',
      costBasis: '3280480.00',
      currentValue: '2964000.00',
      unrealizedPnl: '-316480.00',
      unrealizedPnlPct: '-9.65',
      realizedPnlCumulative: '46430.00',
      avgCostPerBtc: '273373333.33',
      investedThatDay: '0.00',
    });
    expect(usd.body.points.at(-1)).toMatchObject({
      currentValue: EXPECTED_AVERAGE.USD.currentValue,
      costBasis: EXPECTED_AVERAGE.USD.costBasis,
      btcPrice: '110000.00',
    });

    await api.patch('/settings', { displayCurrency: 'USD' });
    expect((await api.get('/portfolio/history')).body).toMatchObject({ range: 'ALL', currency: 'USD' });
  });

  it('never starts before the first transaction', async () => {
    await insertWorkedExample();
    const res = await api.get('/portfolio/history?range=1Y');
    expect(res.body.from).toBe('2026-01-10');
    // No prices at all yet: value fields are null and those days are counted.
    expect(res.body.daysWithoutPrice).toBe(62);
    expect(res.body.points[0].currentValue).toBeNull();
  });

  it('downsamples long series, keeping both ends and every transaction day', async () => {
    await insertWorkedExample();
    vi.setSystemTime(new Date('2027-06-30T09:00:00Z'));
    api.state.token = signToken(api.state.user); // the old one has expired by then

    const res = await api.get('/portfolio/history?range=ALL&currency=USD');

    expect(res.body).toMatchObject({ from: '2026-01-10', to: '2027-06-30', totalDays: 537, downsampled: true });
    expect(res.body.pointCount).toBe(res.body.points.length);
    expect(res.body.pointCount).toBeLessThanOrEqual(400);
    expect(res.body.pointCount).toBeGreaterThan(390);
    const dates = res.body.points.map((p) => p.date);
    for (const d of ['2026-01-10', '2026-02-10', '2026-03-10', '2027-06-30']) expect(dates).toContain(d);
    expect(dates).toEqual([...dates].sort());
  });

  it('is empty without transactions', async () => {
    const res = await api.get('/portfolio/history?range=3M');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ range: '3M', from: null, to: '2026-03-12', pointCount: 0, points: [] });
  });

  it('validates the query', async () => {
    expect((await api.get('/portfolio/history?range=2Y')).status).toBe(400);
    expect((await api.get('/portfolio/history?currency=EUR')).status).toBe(400);
  });
});

describe('GET /portfolio/monthly', () => {
  it('aggregates per calendar month through the current one', async () => {
    await insertWorkedExample();

    const res = await api.get('/portfolio/monthly');

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('TZS');
    expect(res.body.months).toEqual([
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
      {
        month: '2026-02',
        satsAcquired: '500000',
        satsSold: '0',
        buyCount: 1,
        sellCount: 0,
        transferInCount: 0,
        invested: '1575600.00',
        received: '0.00',
        avgBuyPrice: '315120000.00',
      },
      {
        month: '2026-03',
        satsAcquired: '0',
        satsSold: '300000',
        buyCount: 0,
        sellCount: 1,
        transferInCount: 0,
        invested: '0.00',
        received: '866550.00',
        avgBuyPrice: null,
      },
    ]);
    expect(res.body.summary).toEqual({
      monthsSaved: 2,
      currentStreak: 2,
      totalInvested: '4100600.00',
      averagePerMonth: '2050300.00',
    });

    const usd = await api.get('/portfolio/monthly?currency=USD');
    expect(usd.body.months[1]).toMatchObject({ invested: '606.00', avgBuyPrice: '121200.00' });
    expect(usd.body.summary).toMatchObject({ totalInvested: '1616.00', averagePerMonth: '808.00' });
  });

  it('is empty without transactions', async () => {
    const res = await api.get('/portfolio/monthly');
    expect(res.body).toMatchObject({ months: [], summary: { monthsSaved: 0, currentStreak: 0, averagePerMonth: null } });
  });
});

describe('ledger market prices and the FX effect', () => {
  it('adds the BTC market price on each transaction day', async () => {
    await insertWorkedExample();
    await seedPrices();

    const { body } = await api.get('/portfolio/ledger');

    expect(body.map((r) => r.day)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(body.map((r) => r.marketPrice)).toEqual([
      { btcUsd: '100000.00', usdTzs: '2500.0000', btcTzs: '250000000.00', source: 'daily' },
      { btcUsd: '95000.00', usdTzs: '2600.0000', btcTzs: '247000000.00', source: 'carried_forward' },
      { btcUsd: '95000.00', usdTzs: '2600.0000', btcTzs: '247000000.00', source: 'carried_forward' },
    ]);
  });

  it('splits TZS unrealized P/L in the summary', async () => {
    await insertWorkedExample();
    await seedPrices();
    const { body } = await api.get('/portfolio/summary');
    expect(body.TZS).toMatchObject({ btcEffect: '73440.00', fxEffect: '210080.00', unrealizedPnl: '283520.00' });
    expect(body.USD.btcEffect).toBeUndefined();
  });
});
