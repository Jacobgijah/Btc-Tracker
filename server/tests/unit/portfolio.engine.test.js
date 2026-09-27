import { describe, it, expect } from 'vitest';
import {
  computePortfolio,
  computeLedger,
  assertSufficientHoldings,
  InsufficientHoldingsError,
} from '../../src/services/portfolio.engine.js';
import {
  WORKED_TRANSACTIONS,
  WORKED_PRICE,
  EXPECTED_AVERAGE,
  EXPECTED_FIFO,
} from '../fixtures/workedExample.js';

const withIds = (txs) => txs.map((t, i) => ({ id: i + 1, ...t }));
const worked = withIds(WORKED_TRANSACTIONS);

const tx = (overrides) => ({
  feeAmount: '0',
  fiatCurrency: 'USD',
  usdTzsRate: '2500',
  ...overrides,
});

describe('worked example', () => {
  it('matches the hand-computed AVERAGE values', () => {
    const p = computePortfolio({ transactions: worked, price: WORKED_PRICE, costMethod: 'AVERAGE' });

    expect(p.costMethod).toBe('AVERAGE');
    expect(p.transactionCount).toBe(3);
    expect(p.holdings).toEqual(EXPECTED_AVERAGE.holdings);
    expect(p.price).toEqual({
      btcUsd: '110000.00',
      usdTzs: '2700.0000',
      btcTzs: '297000000.00',
      timestamp: null,
    });
    expect(p.TZS).toEqual(EXPECTED_AVERAGE.TZS);
    expect(p.USD).toEqual(EXPECTED_AVERAGE.USD);
  });

  it('matches the hand-computed FIFO values', () => {
    const p = computePortfolio({ transactions: worked, price: WORKED_PRICE, costMethod: 'FIFO' });

    expect(p.holdings).toEqual(EXPECTED_AVERAGE.holdings);
    expect(p.TZS).toMatchObject(EXPECTED_FIFO.TZS);
    expect(p.USD).toMatchObject(EXPECTED_FIFO.USD);
    // Cost method changes the realized/unrealized split, never the total or invested.
    expect(p.TZS.totalPnl).toBe(EXPECTED_AVERAGE.TZS.totalPnl);
    expect(p.USD.totalPnl).toBe(EXPECTED_AVERAGE.USD.totalPnl);
    expect(p.TZS.invested).toBe(EXPECTED_AVERAGE.TZS.invested);
  });

  it('does not depend on input order', () => {
    const shuffled = [worked[2], worked[0], worked[1]];
    const a = computePortfolio({ transactions: worked, price: WORKED_PRICE, costMethod: 'FIFO' });
    const b = computePortfolio({ transactions: shuffled, price: WORKED_PRICE, costMethod: 'FIFO' });
    expect(b).toEqual(a);
  });

  it('accepts a price timestamp and formats it', () => {
    const ts = new Date('2026-04-01T12:00:00Z');
    const p = computePortfolio({ transactions: worked, price: { ...WORKED_PRICE, timestamp: ts } });
    expect(p.price.timestamp).toBe('2026-04-01T12:00:00.000Z');
  });
});

describe('ledger', () => {
  it('gives running values after each transaction (AVERAGE)', () => {
    const rows = computeLedger({ transactions: worked, costMethod: 'AVERAGE' });

    expect(rows.map((r) => r.holdingsSats)).toEqual(['1000000', '1500000', '1200000']);

    expect(rows[0].TZS).toEqual({
      cost: '2525000.00',
      proceeds: null,
      costBasis: '2525000.00',
      avgCostPerBtc: '252500000.00',
      costOfSold: null,
      realizedPnl: null,
    });
    expect(rows[0].USD.cost).toBe('1010.00');
    expect(rows[1].TZS.cost).toBe('1575600.00');
    expect(rows[1].USD.costBasis).toBe('1616.00');

    expect(rows[2].TZS).toMatchObject({
      proceeds: '866550.00',
      costOfSold: '820120.00',
      realizedPnl: '46430.00',
      costBasis: '3280480.00',
    });
    expect(rows[2].USD).toMatchObject({
      proceeds: '327.00',
      costOfSold: '323.20',
      realizedPnl: '3.80',
      costBasis: '1292.80',
    });
  });

  it('gives FIFO cost of sold from the oldest lot', () => {
    const rows = computeLedger({ transactions: worked, costMethod: 'FIFO' });
    expect(rows[2].TZS.costOfSold).toBe('757500.00');
    expect(rows[2].USD.costOfSold).toBe('303.00');
  });

  it('includes serialized transaction fields', () => {
    const [first] = computeLedger({ transactions: worked, costMethod: 'AVERAGE' });
    expect(first).toMatchObject({
      id: 1,
      type: 'BUY',
      date: '2026-01-10T00:00:00.000Z',
      sats: '1000000',
      btc: '0.01000000',
      fiatAmount: '2500000.00',
      feeAmount: '25000.00',
      usdTzsRate: '2500.0000',
    });
  });

  it('is empty with no transactions', () => {
    expect(computeLedger({ transactions: [], costMethod: 'FIFO' })).toEqual([]);
  });
});

describe('edge cases', () => {
  it('handles no transactions', () => {
    const p = computePortfolio({ transactions: [], price: WORKED_PRICE, costMethod: 'AVERAGE' });
    expect(p.transactionCount).toBe(0);
    expect(p.holdings).toEqual({ sats: '0', btc: '0.00000000' });
    expect(p.USD).toEqual({
      invested: '0.00',
      costBasis: '0.00',
      avgCostPerBtc: null,
      realizedPnl: '0.00',
      currentValue: '0.00',
      unrealizedPnl: '0.00',
      unrealizedPnlPct: null,
      totalPnl: '0.00',
    });
  });

  it('returns null price-dependent fields when price is null', () => {
    const p = computePortfolio({ transactions: worked, price: null, costMethod: 'AVERAGE' });
    expect(p.price).toBeNull();
    for (const c of ['USD', 'TZS']) {
      expect(p[c]).toMatchObject({
        currentValue: null,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
        totalPnl: null,
      });
      expect(p[c].realizedPnl).toBe(EXPECTED_AVERAGE[c].realizedPnl);
      expect(p[c].costBasis).toBe(EXPECTED_AVERAGE[c].costBasis);
    }
  });

  it.each(['AVERAGE', 'FIFO'])('selling the entire position zeroes cost basis exactly (%s)', (costMethod) => {
    // 1,000,000 TZS / 2600 is a repeating decimal in USD, so this checks
    // that no dust is left in the cost basis after a full sale.
    const txs = [
      tx({ id: 1, type: 'BUY', date: '2026-01-01', sats: '1000000', fiatAmount: '1000000', fiatCurrency: 'TZS', usdTzsRate: '2600' }),
      tx({ id: 2, type: 'BUY', date: '2026-01-02', sats: '333333', fiatAmount: '100', fiatCurrency: 'USD', usdTzsRate: '2601.1234' }),
      tx({ id: 3, type: 'SELL', date: '2026-02-01', sats: '1333333', fiatAmount: '500', feeAmount: '0', fiatCurrency: 'USD', usdTzsRate: '2600' }),
    ];
    const p = computePortfolio({ transactions: txs, price: WORKED_PRICE, costMethod });

    expect(p.holdings).toEqual({ sats: '0', btc: '0.00000000' });
    for (const c of ['USD', 'TZS']) {
      expect(p[c].costBasis).toBe('0.00');
      expect(p[c].avgCostPerBtc).toBeNull();
      expect(p[c].unrealizedPnlPct).toBeNull();
      expect(p[c].currentValue).toBe('0.00');
      expect(p[c].unrealizedPnl).toBe('0.00');
      expect(p[c].totalPnl).toBe(p[c].realizedPnl);
    }
    // USD: 500 - (1,000,000 / 2600 + 100) = 500 - 484.615384... = 15.384615...
    expect(p.USD.realizedPnl).toBe('15.38');
    // TZS: 500 * 2600 - (1,000,000 + 100 * 2601.1234) = 1,300,000 - 1,260,112.34
    expect(p.TZS.realizedPnl).toBe('39887.66');
  });

  it('throws InsufficientHoldingsError when selling more than held', () => {
    const txs = [
      tx({ id: 7, type: 'BUY', date: '2026-01-01', sats: '1000', fiatAmount: '1' }),
      tx({ id: 8, type: 'SELL', date: '2026-01-05T10:00:00Z', sats: '1001', fiatAmount: '1' }),
    ];
    for (const costMethod of ['AVERAGE', 'FIFO']) {
      let error;
      try {
        computePortfolio({ transactions: txs, price: null, costMethod });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(InsufficientHoldingsError);
      expect(error.transactionId).toBe(8);
      expect(error.date.toISOString()).toBe('2026-01-05T10:00:00.000Z');
      expect(error.attemptedSats).toBe('1001');
      expect(error.availableSats).toBe('1000');
    }
    expect(() => computeLedger({ transactions: txs, costMethod: 'AVERAGE' })).toThrow(InsufficientHoldingsError);
    expect(() => assertSufficientHoldings(txs)).toThrow(InsufficientHoldingsError);
  });

  it('checks holdings at the point in time, not just the final total', () => {
    const txs = [
      tx({ id: 1, type: 'SELL', date: '2026-01-01', sats: '500', fiatAmount: '1' }),
      tx({ id: 2, type: 'BUY', date: '2026-01-02', sats: '1000', fiatAmount: '1' }),
    ];
    expect(() => assertSufficientHoldings(txs)).toThrow(InsufficientHoldingsError);
  });

  it('treats TRANSFER_IN with fiatAmount 0 as zero-cost holdings', () => {
    const txs = [
      tx({ id: 1, type: 'TRANSFER_IN', date: '2026-01-01', sats: '200000', fiatAmount: '0', fiatCurrency: 'TZS' }),
    ];
    const p = computePortfolio({ transactions: txs, price: { btcUsd: '100000', usdTzs: '2500' }, costMethod: 'AVERAGE' });

    expect(p.holdings.btc).toBe('0.00200000');
    expect(p.USD).toEqual({
      invested: '0.00',
      costBasis: '0.00',
      avgCostPerBtc: '0.00',
      realizedPnl: '0.00',
      currentValue: '200.00',
      unrealizedPnl: '200.00',
      unrealizedPnlPct: null,
      totalPnl: '200.00',
    });
    expect(p.TZS.currentValue).toBe('500000.00');
  });

  it('counts TRANSFER_IN at market value like a buy', () => {
    const txs = [
      tx({ id: 1, type: 'TRANSFER_IN', date: '2026-01-01', sats: '100000', fiatAmount: '100', feeAmount: '1' }),
    ];
    const p = computePortfolio({ transactions: txs, price: null, costMethod: 'FIFO' });
    expect(p.USD.invested).toBe('101.00');
    expect(p.TZS.costBasis).toBe('252500.00');
  });

  it('FIFO sell spanning two lots splits the second lot proportionally', () => {
    const txs = [
      tx({ id: 1, type: 'BUY', date: '2026-01-01', sats: '100000', fiatAmount: '100', usdTzsRate: '2000' }),
      tx({ id: 2, type: 'BUY', date: '2026-01-02', sats: '100000', fiatAmount: '300', usdTzsRate: '2500' }),
      tx({ id: 3, type: 'SELL', date: '2026-01-03', sats: '150000', fiatAmount: '450', usdTzsRate: '3000' }),
    ];
    const rows = computeLedger({ transactions: txs, costMethod: 'FIFO' });
    const sell = rows[2];

    // Whole lot 1 (100 USD / 200,000 TZS) + half of lot 2 (150 USD / 375,000 TZS)
    expect(sell.USD.costOfSold).toBe('250.00');
    expect(sell.TZS.costOfSold).toBe('575000.00');
    expect(sell.USD.realizedPnl).toBe('200.00');
    expect(sell.TZS.realizedPnl).toBe('775000.00'); // 1,350,000 - 575,000
    // Remaining: the other half of lot 2
    expect(sell.holdingsSats).toBe('50000');
    expect(sell.USD.costBasis).toBe('150.00');
    expect(sell.TZS.costBasis).toBe('375000.00');
    expect(sell.USD.avgCostPerBtc).toBe('300000.00');

    // The same trades under AVERAGE: 150k / 200k of (400 USD, 950,000 TZS)
    const avg = computeLedger({ transactions: txs, costMethod: 'AVERAGE' })[2];
    expect(avg.USD.costOfSold).toBe('300.00');
    expect(avg.TZS.costOfSold).toBe('712500.00');
  });

  it('orders same-date transactions by id', () => {
    const buy = tx({ id: 1, type: 'BUY', date: '2026-01-01T00:00:00Z', sats: '1000', fiatAmount: '10' });
    const sell = tx({ id: 2, type: 'SELL', date: '2026-01-01T00:00:00Z', sats: '1000', fiatAmount: '12' });

    // Passed in reverse; id order puts the buy first, so this is valid.
    const p = computePortfolio({ transactions: [sell, buy], price: null, costMethod: 'AVERAGE' });
    expect(p.holdings.sats).toBe('0');
    expect(p.USD.realizedPnl).toBe('2.00');
    expect(computeLedger({ transactions: [sell, buy], costMethod: 'FIFO' }).map((r) => r.id)).toEqual([1, 2]);

    // Swap the ids: now the sell comes first on that date and must fail.
    expect(() =>
      assertSufficientHoldings([{ ...buy, id: 2 }, { ...sell, id: 1 }]),
    ).toThrow(InsufficientHoldingsError);
  });

  it('sorts unsaved transactions (id null) after saved ones on the same date', () => {
    const buy = tx({ id: null, type: 'BUY', date: '2026-01-01', sats: '1000', fiatAmount: '10' });
    const sell = tx({ id: 5, type: 'SELL', date: '2026-01-01', sats: '1000', fiatAmount: '12' });
    expect(() => assertSufficientHoldings([buy, sell])).toThrow(InsufficientHoldingsError);
  });

  it('accepts Prisma-style Decimal objects and BigInt sats', async () => {
    const { Prisma } = await import('@prisma/client');
    const txs = worked.map((t) => ({
      ...t,
      sats: BigInt(t.sats),
      fiatAmount: new Prisma.Decimal(t.fiatAmount),
      feeAmount: new Prisma.Decimal(t.feeAmount),
      usdTzsRate: new Prisma.Decimal(t.usdTzsRate),
      date: new Date(t.date),
    }));
    const p = computePortfolio({
      transactions: txs,
      price: { btcUsd: new Prisma.Decimal('110000'), usdTzs: new Prisma.Decimal('2700') },
      costMethod: 'AVERAGE',
    });
    expect(p.TZS).toEqual(EXPECTED_AVERAGE.TZS);
  });

  it('rejects an unknown cost method', () => {
    expect(() => computePortfolio({ transactions: [], price: null, costMethod: 'LIFO' })).toThrow(TypeError);
  });
});
