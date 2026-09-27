import { describe, it, expect } from 'vitest';
import {
  computeHistory,
  computePortfolio,
  computeLedger,
  computeMonthly,
  downsampleHistory,
} from '../../src/services/portfolio.engine.js';
import { D } from '../../src/lib/money.js';
import { WORKED_TRANSACTIONS, WORKED_PRICE, EXPECTED_AVERAGE, EXPECTED_FIFO } from '../fixtures/workedExample.js';

const worked = WORKED_TRANSACTIONS.map((t, i) => ({ id: i + 1, ...t }));
const price = (date, btcUsd, usdTzs, extra = {}) => ({ date, btcUsd, usdTzs, ...extra });
const history = (opts) => computeHistory({ transactions: worked, costMethod: 'AVERAGE', timeZone: 'UTC', ...opts });
const byDate = (points) => Object.fromEntries(points.map((p) => [p.date, p]));

describe('computeHistory: daily replay', () => {
  const points = history({
    from: '2026-01-09',
    to: '2026-01-12',
    dailyPrices: [
      price('2026-01-09', '100000', '2500'),
      price('2026-01-10', '100000', '2500'),
      // 2026-01-11 missing
      price('2026-01-12', '110000', '2600'),
    ],
  });
  const p = byDate(points);

  it('returns one point per day', () => {
    expect(points.map((x) => x.date)).toEqual(['2026-01-09', '2026-01-10', '2026-01-11', '2026-01-12']);
  });

  it('is empty before the first buy', () => {
    expect(p['2026-01-09']).toMatchObject({ holdingsSats: '0', transactionCount: 0, priceSource: 'daily' });
    expect(p['2026-01-09'].USD).toEqual({
      btcPrice: '100000.00',
      costBasis: '0.00',
      currentValue: '0.00',
      unrealizedPnl: '0.00',
      unrealizedPnlPct: null,
      realizedPnlCumulative: '0.00',
      avgCostPerBtc: null,
      investedThatDay: '0.00',
    });
  });

  it('values the buy day at that day\'s price', () => {
    const day = p['2026-01-10'];
    expect(day).toMatchObject({
      holdingsSats: '1000000',
      btcUsd: '100000.00',
      usdTzs: '2500.0000',
      priceSource: 'daily',
      transactionCount: 1,
    });
    // 0.01 BTC at 100,000 USD = 1,000 USD; cost 2,525,000 TZS / 2500 = 1,010 USD
    expect(day.USD).toEqual({
      btcPrice: '100000.00',
      costBasis: '1010.00',
      currentValue: '1000.00',
      unrealizedPnl: '-10.00',
      unrealizedPnlPct: '-0.99', // -10 / 1010
      realizedPnlCumulative: '0.00',
      avgCostPerBtc: '101000.00',
      investedThatDay: '1010.00',
    });
    // 0.01 BTC at 100,000 × 2500 = 2,500,000 TZS
    expect(day.TZS).toEqual({
      btcPrice: '250000000.00',
      costBasis: '2525000.00',
      currentValue: '2500000.00',
      unrealizedPnl: '-25000.00',
      unrealizedPnlPct: '-0.99',
      realizedPnlCumulative: '0.00',
      avgCostPerBtc: '252500000.00',
      investedThatDay: '2525000.00',
    });
  });

  it('carries the previous day\'s price forward over a missing day', () => {
    const day = p['2026-01-11'];
    expect(day).toMatchObject({ priceSource: 'carried_forward', btcUsd: '100000.00', usdTzs: '2500.0000', transactionCount: 0 });
    expect(day.TZS).toMatchObject({ currentValue: '2500000.00', investedThatDay: '0.00' });
  });

  it('uses each day\'s own usdTzs for the TZS value', () => {
    // 0.01 BTC × 110,000 USD × 2600 = 2,860,000 TZS; cost basis unchanged at 2,525,000
    expect(p['2026-01-12'].TZS).toMatchObject({
      btcPrice: '286000000.00',
      currentValue: '2860000.00',
      unrealizedPnl: '335000.00',
      costBasis: '2525000.00',
    });
    expect(p['2026-01-12'].USD).toMatchObject({ currentValue: '1100.00', unrealizedPnl: '90.00' });
  });
});

describe('computeHistory: prices', () => {
  it('leaves value fields null before the first known price', () => {
    const [first] = history({ from: '2026-01-10', to: '2026-01-10', dailyPrices: [] });
    expect(first).toMatchObject({ priceSource: null, btcUsd: null, usdTzs: null, holdingsSats: '1000000' });
    expect(first.TZS).toMatchObject({ btcPrice: null, currentValue: null, unrealizedPnl: null, costBasis: '2525000.00' });
  });

  it('carries forward from a price before `from`', () => {
    const [first] = history({ from: '2026-01-20', to: '2026-01-20', dailyPrices: [price('2026-01-02', '90000', '2400')] });
    expect(first).toMatchObject({ priceSource: 'carried_forward', btcUsd: '90000.00', usdTzs: '2400.0000' });
  });

  it('flags a stored day whose FX rate was carried forward by the backfill', () => {
    const [first] = history({
      from: '2026-01-10',
      to: '2026-01-10',
      dailyPrices: [{ date: new Date('2026-01-10T00:00:00Z'), btcUsd: '100000', usdTzs: '2500', fxSource: 'carried_forward' }],
    });
    expect(first.priceSource).toBe('carried_forward');
    expect(first.TZS.currentValue).toBe('2500000.00');
  });

  it('uses the live price for the last day only', () => {
    const points = history({
      from: '2026-01-10',
      to: '2026-01-11',
      dailyPrices: [price('2026-01-10', '100000', '2500'), price('2026-01-11', '1', '1')],
      latestPrice: { btcUsd: '200000', usdTzs: '2000' },
    });
    expect(points.map((x) => [x.priceSource, x.btcUsd])).toEqual([
      ['daily', '100000.00'],
      ['live', '200000.00'],
    ]);
  });
});

describe('computeHistory: replay rules', () => {
  it('counts transactions before `from` and ignores those after `to`', () => {
    const points = history({ from: '2026-02-15', to: '2026-03-09', dailyPrices: [price('2026-02-01', '100000', '2600')] });
    expect(points[0]).toMatchObject({ holdingsSats: '1500000', transactionCount: 0 });
    expect(points[0].TZS.investedThatDay).toBe('0.00');
    expect(points.at(-1).holdingsSats).toBe('1500000'); // the 10 March sell is after `to`
  });

  it('does not count a sell as money invested that day', () => {
    const sellDay = byDate(history({ from: '2026-03-10', to: '2026-03-10' }))['2026-03-10'];
    expect(sellDay).toMatchObject({ transactionCount: 1, holdingsSats: '1200000' });
    expect(sellDay.USD.investedThatDay).toBe('0.00');
  });

  it('buckets transactions into days in the given time zone', () => {
    const txs = [{ id: 1, type: 'BUY', date: '2026-01-09T22:00:00Z', sats: '1000', fiatAmount: '10', feeAmount: '0', fiatCurrency: 'USD', usdTzsRate: '2500' }];
    const opts = { transactions: txs, from: '2026-01-09', to: '2026-01-10' };
    const utc = computeHistory({ ...opts, timeZone: 'UTC' });
    const eat = computeHistory({ ...opts, timeZone: 'Africa/Dar_es_Salaam' });
    expect(utc.map((x) => x.transactionCount)).toEqual([1, 0]);
    expect(eat.map((x) => x.transactionCount)).toEqual([0, 1]); // 01:00 on the 10th in Dar es Salaam
    expect(eat.map((x) => x.holdingsSats)).toEqual(['0', '1000']);
  });

  it('matches AVERAGE and FIFO realized/unrealized on the sell day', () => {
    const opts = { from: '2026-03-09', to: '2026-03-10', dailyPrices: [price('2026-03-01', '110000', '2700')] };
    const [avgBefore, avg] = history({ ...opts, costMethod: 'AVERAGE' });
    const [fifoBefore, fifo] = history({ ...opts, costMethod: 'FIFO' });

    // Identical until something is sold
    expect(fifoBefore).toEqual(avgBefore);
    expect(avgBefore.TZS).toMatchObject({ costBasis: '4100600.00', realizedPnlCumulative: '0.00' });

    expect(avg.TZS).toMatchObject({
      realizedPnlCumulative: EXPECTED_AVERAGE.TZS.realizedPnl,
      costBasis: EXPECTED_AVERAGE.TZS.costBasis,
      unrealizedPnl: EXPECTED_AVERAGE.TZS.unrealizedPnl,
    });
    expect(fifo.TZS).toMatchObject({
      realizedPnlCumulative: EXPECTED_FIFO.TZS.realizedPnl,
      costBasis: EXPECTED_FIFO.TZS.costBasis,
      unrealizedPnl: EXPECTED_FIFO.TZS.unrealizedPnl,
    });
    expect(fifo.USD).toMatchObject({ realizedPnlCumulative: '24.00', costBasis: '1313.00' });
    // Same value, same total P/L
    expect(fifo.TZS.currentValue).toBe(avg.TZS.currentValue);
  });

  it('returns no points when from is after to', () => {
    expect(history({ from: '2026-02-02', to: '2026-02-01' })).toEqual([]);
  });

  it('requires from and to', () => {
    expect(() => history({ from: '2026-01-01' })).toThrow(TypeError);
  });
});

describe('computeHistory: last point equals computePortfolio', () => {
  const messy = [
    { id: 1, type: 'BUY', date: '2025-11-03T08:00:00Z', sats: '1000000', fiatAmount: '1000000', feeAmount: '1234.56', fiatCurrency: 'TZS', usdTzsRate: '2600' },
    { id: 2, type: 'TRANSFER_IN', date: '2025-11-20T08:00:00Z', sats: '333333', fiatAmount: '100', feeAmount: '0', fiatCurrency: 'USD', usdTzsRate: '2601.1234' },
    { id: 3, type: 'SELL', date: '2025-12-24T08:00:00Z', sats: '777777', fiatAmount: '777.77', feeAmount: '7.77', fiatCurrency: 'USD', usdTzsRate: '2633.3333' },
    { id: 4, type: 'BUY', date: '2026-01-15T08:00:00Z', sats: '123457', fiatAmount: '333333.33', feeAmount: '0', fiatCurrency: 'TZS', usdTzsRate: '2577.7777' },
  ];
  const cases = [
    ['worked example', worked, '2026-01-10', WORKED_PRICE],
    ['messy ledger', messy, '2025-11-03', { btcUsd: '98765.43', usdTzs: '2654.3217' }],
  ];

  for (const [name, transactions, from, latestPrice] of cases) {
    for (const costMethod of ['AVERAGE', 'FIFO']) {
      it(`${name}, ${costMethod}`, () => {
        const points = computeHistory({
          transactions,
          costMethod,
          from,
          to: '2026-03-12',
          timeZone: 'Africa/Dar_es_Salaam',
          dailyPrices: [price('2025-12-01', '90000', '2500'), price('2026-02-01', '95000', '2550')],
          latestPrice,
        });
        const last = points.at(-1);
        const summary = computePortfolio({ transactions, price: latestPrice, costMethod });

        expect(last.date).toBe('2026-03-12');
        expect(last.priceSource).toBe('live');
        expect(last.holdingsSats).toBe(summary.holdings.sats);
        expect(last.btcUsd).toBe(summary.price.btcUsd);
        expect(last.usdTzs).toBe(summary.price.usdTzs);
        for (const c of ['USD', 'TZS']) {
          expect(last[c]).toMatchObject({
            costBasis: summary[c].costBasis,
            currentValue: summary[c].currentValue,
            unrealizedPnl: summary[c].unrealizedPnl,
            unrealizedPnlPct: summary[c].unrealizedPnlPct,
            realizedPnlCumulative: summary[c].realizedPnl,
            avgCostPerBtc: summary[c].avgCostPerBtc,
          });
        }
        expect(last.TZS.btcPrice).toBe(summary.price.btcTzs);
      });
    }
  }

  it('and equals the README worked example', () => {
    const last = history({ from: '2026-03-01', to: '2026-03-12', latestPrice: WORKED_PRICE }).at(-1);
    expect(last.TZS).toMatchObject({
      costBasis: EXPECTED_AVERAGE.TZS.costBasis,
      currentValue: EXPECTED_AVERAGE.TZS.currentValue,
      unrealizedPnl: EXPECTED_AVERAGE.TZS.unrealizedPnl,
      realizedPnlCumulative: EXPECTED_AVERAGE.TZS.realizedPnl,
    });
  });
});

describe('FX effect', () => {
  it('splits the worked example TZS unrealized P/L (AVERAGE)', () => {
    const { TZS, USD } = computePortfolio({ transactions: worked, price: WORKED_PRICE, costMethod: 'AVERAGE' });
    // btcEffect = 27.20 USD × 2700 = 73,440
    expect(TZS.btcEffect).toBe('73440.00');
    // fxEffect = 1,292.80 USD × 2700 − 3,280,480 TZS = 210,080
    expect(TZS.fxEffect).toBe('210080.00');
    expect(new D(TZS.btcEffect).plus(TZS.fxEffect).toFixed(2)).toBe('283520.00');
    expect(TZS.unrealizedPnl).toBe('283520.00');
    // Only TZS has an FX effect
    expect(USD).not.toHaveProperty('btcEffect');
  });

  it('splits the FIFO numbers too', () => {
    const { TZS } = computePortfolio({ transactions: worked, price: WORKED_PRICE, costMethod: 'FIFO' });
    expect(TZS).toMatchObject({ btcEffect: '18900.00', fxEffect: '202000.00', unrealizedPnl: '220900.00' });
  });

  it('is null without a price', () => {
    const { TZS } = computePortfolio({ transactions: worked, price: null });
    expect(TZS).toMatchObject({ btcEffect: null, fxEffect: null });
  });

  it('always adds up exactly, and fxEffect stays within 0.01 of its formula', () => {
    const prices = [
      { btcUsd: '12345.67', usdTzs: '2603.3333' },
      { btcUsd: '98765.43', usdTzs: '2499.9999' },
      { btcUsd: '64000.01', usdTzs: '2712.3457' },
      { btcUsd: '105000.5', usdTzs: '2650.0001' },
    ];
    const txs = [
      { id: 1, type: 'BUY', date: '2026-01-01', sats: '333333', fiatAmount: '100', feeAmount: '0.99', fiatCurrency: 'USD', usdTzsRate: '2601.1234' },
      { id: 2, type: 'BUY', date: '2026-01-02', sats: '777777', fiatAmount: '1234567.89', feeAmount: '1000', fiatCurrency: 'TZS', usdTzsRate: '2587.6543' },
    ];
    for (const p of prices) {
      const { TZS, USD } = computePortfolio({ transactions: txs, price: p, costMethod: 'AVERAGE' });
      expect(new D(TZS.btcEffect).plus(TZS.fxEffect).toFixed(2)).toBe(TZS.unrealizedPnl);
      // fxEffect by its own formula, from exact inputs:
      // USD cost = 100.99 + 1,235,567.89 / 2587.6543; TZS cost = 100.99 × 2601.1234 + 1,235,567.89
      const usdCost = new D('100.99').plus(new D('1235567.89').div('2587.6543'));
      const tzsCost = new D('100.99').times('2601.1234').plus('1235567.89');
      const fxExact = usdCost.times(p.usdTzs).minus(tzsCost);
      expect(new D(TZS.fxEffect).minus(fxExact).abs().lte('0.01')).toBe(true);
      expect(USD.costBasis).toBe(usdCost.toFixed(2));
    }
  });
});

describe('computeLedger: market price', () => {
  it('adds the day and the BTC price on that day', () => {
    const rows = computeLedger({
      transactions: worked,
      dailyPrices: [price('2026-01-10', '95000', '2500'), price('2026-03-01', '105000', '2650')],
      latestPrice: WORKED_PRICE,
      today: '2026-03-10',
      timeZone: 'Africa/Dar_es_Salaam',
    });
    expect(rows.map((r) => r.day)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(rows.map((r) => r.marketPrice)).toEqual([
      { btcUsd: '95000.00', usdTzs: '2500.0000', btcTzs: '237500000.00', source: 'daily' },
      { btcUsd: '95000.00', usdTzs: '2500.0000', btcTzs: '237500000.00', source: 'carried_forward' },
      { btcUsd: '110000.00', usdTzs: '2700.0000', btcTzs: '297000000.00', source: 'live' },
    ]);
  });

  it('is null when no price is known yet', () => {
    const [row] = computeLedger({ transactions: worked.slice(0, 1) });
    expect(row.marketPrice).toBeNull();
  });
});

describe('downsampleHistory', () => {
  const series = (n, isTxDay = () => false) =>
    Array.from({ length: n }, (_, i) => ({ date: `d${i}`, i, transactionCount: isTxDay(i) ? 1 : 0 }));

  it('leaves short series alone', () => {
    const s = series(400);
    expect(downsampleHistory(s, 400)).toBe(s);
  });

  it('keeps the endpoints and every transaction day, evenly spaced otherwise', () => {
    const txDay = (i) => i % 97 === 5;
    const s = series(1000, txDay);
    const out = downsampleHistory(s, 400);

    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.length).toBeGreaterThan(390);
    expect(out[0].i).toBe(0);
    expect(out.at(-1).i).toBe(999);
    for (const p of s.filter((x) => txDay(x.i))) expect(out).toContain(p);
    const idx = out.map((p) => p.i);
    expect(idx).toEqual([...idx].sort((a, b) => a - b)); // still in order
    const gaps = idx.slice(1).map((v, k) => v - idx[k]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(4); // 1000 days / ~400 points
  });

  it('keeps every transaction day even when they exceed the budget', () => {
    const s = series(1000, (i) => i % 2 === 0);
    const out = downsampleHistory(s, 400);
    expect(out.filter((p) => p.transactionCount > 0)).toHaveLength(500);
    expect(out.at(-1).i).toBe(999);
  });
});

describe('computeMonthly', () => {
  it('aggregates the worked example per month', () => {
    const { months, summary } = computeMonthly({ transactions: worked, timeZone: 'UTC', throughMonth: '2026-03' });

    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(months[0]).toEqual({
      month: '2026-01',
      satsAcquired: '1000000',
      satsSold: '0',
      buyCount: 1,
      sellCount: 0,
      transferInCount: 0,
      // 2,500,000 + 25,000 fee; per BTC: 2,525,000 / 0.01
      TZS: { invested: '2525000.00', received: '0.00', avgBuyPrice: '252500000.00' },
      USD: { invested: '1010.00', received: '0.00', avgBuyPrice: '101000.00' },
    });
    // 606 USD × 2600 = 1,575,600 TZS; 606 / 0.005 BTC = 121,200 USD per BTC
    expect(months[1].USD).toEqual({ invested: '606.00', received: '0.00', avgBuyPrice: '121200.00' });
    expect(months[1].TZS).toEqual({ invested: '1575600.00', received: '0.00', avgBuyPrice: '315120000.00' });
    // Sell: (330 − 3) USD = 327 USD = 866,550 TZS at 2650
    expect(months[2]).toMatchObject({ satsAcquired: '0', satsSold: '300000', buyCount: 0, sellCount: 1 });
    expect(months[2].TZS).toEqual({ invested: '0.00', received: '866550.00', avgBuyPrice: null });

    expect(summary).toEqual({
      monthsSaved: 2,
      currentStreak: 2, // March has no buy yet but isn't over
      // totalInvested matches the summary's `invested`
      TZS: { totalInvested: EXPECTED_AVERAGE.TZS.invested, averagePerMonth: '2050300.00' },
      USD: { totalInvested: EXPECTED_AVERAGE.USD.invested, averagePerMonth: '808.00' },
    });
  });

  it('fills quiet months with zeros up to the current month and ends the streak', () => {
    const { months, summary } = computeMonthly({ transactions: worked, timeZone: 'UTC', throughMonth: '2026-05' });
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
    expect(months[3]).toMatchObject({ buyCount: 0, satsAcquired: '0', TZS: { invested: '0.00', avgBuyPrice: null } });
    expect(summary.currentStreak).toBe(0); // April had no buy
    expect(summary.monthsSaved).toBe(2);
  });

  it('counts transfers in as acquired but not as a buy', () => {
    const txs = [
      { id: 1, type: 'TRANSFER_IN', date: '2026-01-05', sats: '5000', fiatAmount: '0', fiatCurrency: 'TZS', usdTzsRate: '2500' },
      { id: 2, type: 'BUY', date: '2026-02-05', sats: '5000', fiatAmount: '10', fiatCurrency: 'USD', usdTzsRate: '2500' },
      { id: 3, type: 'BUY', date: '2026-02-20', sats: '5000', fiatAmount: '20', fiatCurrency: 'USD', usdTzsRate: '2500' },
    ];
    const { months, summary } = computeMonthly({ transactions: txs, throughMonth: '2026-02' });
    expect(months[0]).toMatchObject({ satsAcquired: '5000', buyCount: 0, transferInCount: 1 });
    expect(months[1]).toMatchObject({ satsAcquired: '10000', buyCount: 2, USD: { invested: '30.00', avgBuyPrice: '300000.00' } });
    expect(summary).toMatchObject({ monthsSaved: 1, currentStreak: 1, USD: { averagePerMonth: '30.00' } });
  });

  it('uses the time zone to pick the month', () => {
    const txs = [{ id: 1, type: 'BUY', date: '2026-01-31T22:00:00Z', sats: '1', fiatAmount: '1', fiatCurrency: 'USD', usdTzsRate: '2500' }];
    expect(computeMonthly({ transactions: txs, timeZone: 'UTC' }).months[0].month).toBe('2026-01');
    expect(computeMonthly({ transactions: txs, timeZone: 'Africa/Dar_es_Salaam' }).months[0].month).toBe('2026-02');
  });

  it('is empty with no transactions', () => {
    expect(computeMonthly({ transactions: [] })).toEqual({
      months: [],
      summary: {
        monthsSaved: 0,
        currentStreak: 0,
        USD: { totalInvested: '0.00', averagePerMonth: null },
        TZS: { totalInvested: '0.00', averagePerMonth: null },
      },
    });
  });
});
