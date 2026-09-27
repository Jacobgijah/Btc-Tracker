import { prisma } from '../lib/prisma.js';
import { computePortfolio, computeLedger } from './portfolio.engine.js';
import { getSettings } from './settings.service.js';
import { findLatestSnapshot, isStale } from './prices/price.service.js';

const CHRONOLOGICAL = [{ date: 'asc' }, { id: 'asc' }];

async function loadInputs() {
  const [transactions, snapshot, settings] = await Promise.all([
    prisma.transaction.findMany({ orderBy: CHRONOLOGICAL }),
    findLatestSnapshot(),
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
  const inputs = await loadInputs();
  const summary = computePortfolio(inputs);
  if (summary.price) summary.price.stale = isStale(inputs.price.timestamp);
  return summary;
}

export async function getLedger() {
  const { transactions, costMethod } = await loadInputs();
  return computeLedger({ transactions, costMethod });
}
