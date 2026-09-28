// Hand-computed worked example shared by unit and integration tests.

export const WORKED_TRANSACTIONS = [
  {
    type: 'BUY',
    date: '2026-01-10T00:00:00.000Z',
    sats: '1000000',
    fiatAmount: '2500000',
    feeAmount: '25000',
    fiatCurrency: 'TZS',
    usdTzsRate: '2500',
  },
  {
    type: 'BUY',
    date: '2026-02-10T00:00:00.000Z',
    sats: '500000',
    fiatAmount: '600',
    feeAmount: '6',
    fiatCurrency: 'USD',
    usdTzsRate: '2600',
  },
  {
    type: 'SELL',
    date: '2026-03-10T00:00:00.000Z',
    sats: '300000',
    fiatAmount: '330',
    feeAmount: '3',
    fiatCurrency: 'USD',
    usdTzsRate: '2650',
  },
];

export const WORKED_PRICE = { btcUsd: '110000', usdTzs: '2700' };

export const EXPECTED_AVERAGE = {
  holdings: { sats: '1200000', btc: '0.01200000' },
  TZS: {
    invested: '4100600.00',
    costBasis: '3280480.00',
    avgCostPerBtc: '273373333.33',
    realizedPnl: '46430.00',
    currentValue: '3564000.00',
    unrealizedPnl: '283520.00',
    unrealizedPnlPct: '8.64',
    totalPnl: '329950.00',
    // USD unrealized 27.20 × 2700 = 73,440
    btcEffect: '73440.00',
    // USD cost basis 1,292.80 × 2700 − 3,280,480 = 3,490,560 − 3,280,480 = 210,080
    fxEffect: '210080.00',
  },
  USD: {
    invested: '1616.00',
    costBasis: '1292.80',
    avgCostPerBtc: '107733.33',
    realizedPnl: '3.80',
    currentValue: '1320.00',
    unrealizedPnl: '27.20',
    unrealizedPnlPct: '2.10',
    totalPnl: '31.00',
  },
};

export const EXPECTED_FIFO = {
  TZS: {
    realizedPnl: '109050.00',
    costBasis: '3343100.00',
    unrealizedPnl: '220900.00',
    totalPnl: '329950.00',
    // 7.00 × 2700 = 18,900 and 1,313 × 2700 − 3,343,100 = 202,000; sum 220,900
    btcEffect: '18900.00',
    fxEffect: '202000.00',
  },
  USD: {
    realizedPnl: '24.00',
    costBasis: '1313.00',
    unrealizedPnl: '7.00',
    totalPnl: '31.00',
  },
};
