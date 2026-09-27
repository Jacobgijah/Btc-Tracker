import { prisma } from '../lib/prisma.js';
import { computePortfolio, computeLedger } from './portfolio.engine.js';
import { getSettings } from './settings.service.js';

const CHRONOLOGICAL = [{ date: 'asc' }, { id: 'asc' }];

async function loadInputs() {
  const [transactions, snapshot, settings] = await Promise.all([
    prisma.transaction.findMany({ orderBy: CHRONOLOGICAL }),
    prisma.priceSnapshot.findFirst({ orderBy: [{ timestamp: 'desc' }, { id: 'desc' }] }),
    getSettings(),
  ]);
  const price = snapshot && {
    btcUsd: snapshot.btcUsd,
    usdTzs: snapshot.usdTzs,
    timestamp: snapshot.timestamp,
  };
  return { transactions, price, costMethod: settings.costMethod };
}

export async function getPortfolioSummary() {
  return computePortfolio(await loadInputs());
}

export async function getLedger() {
  const { transactions, costMethod } = await loadInputs();
  return computeLedger({ transactions, costMethod });
}
