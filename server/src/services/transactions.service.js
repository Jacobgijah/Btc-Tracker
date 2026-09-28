import { prisma } from '../lib/prisma.js';
import { serializeTransaction } from '../lib/serialize.js';
import { assertSufficientHoldings } from './portfolio.engine.js';
import { mergedRecordSchema } from '../schemas/transaction.schema.js';
import { resolveUsdTzsForDate } from './prices/fxRate.service.js';
import { HttpError } from '../lib/errors.js';

// Serializes all ledger-changing writes so two concurrent requests can't each
// pass the over-sell check against a ledger the other is about to change.
const LEDGER_LOCK_KEY = 872_341_001;

/**
 * Runs `mutate` in a DB transaction after replaying the whole ledger with the
 * proposed change applied. Nothing is written if any sell would exceed the
 * holdings at its point in time (InsufficientHoldingsError -> 422).
 */
function withLedgerCheck(userId, propose, mutate) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_KEY}::int, ${userId}::int)`;
    const current = await tx.transaction.findMany({ where: { userId } });
    const proposed = await propose(tx, current);
    assertSufficientHoldings(proposed);
    return mutate(tx);
  });
}

export async function listTransactions(userId, { type, from, to, page, pageSize }) {
  const where = {
    userId,
    ...(type && { type }),
    ...((from || to) && { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);
  return { data: rows.map(serializeTransaction), page, pageSize, total };
}

export async function getTransaction(userId, id) {
  return serializeTransaction(await prisma.transaction.findFirstOrThrow({ where: { id, userId } }));
}

/**
 * A rate given by the user always wins; otherwise look one up for the date.
 * Returns { usdTzsRate, usdTzsRateSource }.
 */
async function resolveRate(data) {
  if (data.usdTzsRate !== undefined) {
    return { usdTzsRate: data.usdTzsRate, usdTzsRateSource: 'provided' };
  }
  const found = await resolveUsdTzsForDate(data.date);
  if (!found) {
    const day = data.date.toISOString().slice(0, 10);
    throw new HttpError(
      422,
      `Couldn't find a USD/TZS rate for ${day}. Please enter usdTzsRate manually.`,
      { field: 'usdTzsRate', date: day },
    );
  }
  return { usdTzsRate: found.rate.toFixed(4), usdTzsRateSource: found.source };
}

export async function createTransaction(userId, input) {
  // Network lookups happen before the DB transaction (and its lock) starts.
  const { usdTzsRate, usdTzsRateSource } = await resolveRate(input);
  const data = { ...input, usdTzsRate, userId };
  const created = await withLedgerCheck(
    userId,
    (tx, current) => [...current, { ...data, id: null }],
    (tx) => tx.transaction.create({ data }),
  );
  return { ...serializeTransaction(created), usdTzsRateSource };
}

export async function updateTransaction(userId, id, patch) {
  const updated = await withLedgerCheck(
    userId,
    async (tx, current) => {
      const existing = await tx.transaction.findFirstOrThrow({ where: { id, userId } });
      // Re-check cross-field rules against the merged row, e.g. a patch that
      // only lowers fiatAmount below the stored fee of a SELL.
      mergedRecordSchema.parse({
        ...existing,
        fiatAmount: existing.fiatAmount.toFixed(),
        feeAmount: existing.feeAmount.toFixed(),
        ...patch,
      });
      return current.map((t) => (t.id === id ? { ...t, ...patch } : t));
    },
    (tx) => tx.transaction.update({ where: { id }, data: patch }),
  );
  return serializeTransaction(updated);
}

export async function deleteTransaction(userId, id) {
  await withLedgerCheck(
    userId,
    async (tx, current) => {
      await tx.transaction.findFirstOrThrow({ where: { id, userId } });
      return current.filter((t) => t.id !== id);
    },
    (tx) => tx.transaction.delete({ where: { id } }),
  );
}
