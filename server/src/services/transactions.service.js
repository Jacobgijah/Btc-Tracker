import { prisma } from '../lib/prisma.js';
import { serializeTransaction } from '../lib/serialize.js';
import { assertSufficientHoldings } from './portfolio.engine.js';
import { mergedRecordSchema } from '../schemas/transaction.schema.js';

// Serializes all ledger-changing writes so two concurrent requests can't each
// pass the over-sell check against a ledger the other is about to change.
const LEDGER_LOCK_KEY = 872_341_001;

/**
 * Runs `mutate` in a DB transaction after replaying the whole ledger with the
 * proposed change applied. Nothing is written if any sell would exceed the
 * holdings at its point in time (InsufficientHoldingsError -> 422).
 */
function withLedgerCheck(propose, mutate) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_KEY})`;
    const current = await tx.transaction.findMany();
    const proposed = await propose(tx, current);
    assertSufficientHoldings(proposed);
    return mutate(tx);
  });
}

export async function listTransactions({ type, from, to, page, pageSize }) {
  const where = {
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

export async function getTransaction(id) {
  return serializeTransaction(await prisma.transaction.findUniqueOrThrow({ where: { id } }));
}

export async function createTransaction(data) {
  const created = await withLedgerCheck(
    (tx, current) => [...current, { ...data, id: null }],
    (tx) => tx.transaction.create({ data }),
  );
  return serializeTransaction(created);
}

export async function updateTransaction(id, patch) {
  const updated = await withLedgerCheck(
    async (tx, current) => {
      const existing = await tx.transaction.findUniqueOrThrow({ where: { id } });
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

export async function deleteTransaction(id) {
  await withLedgerCheck(
    async (tx, current) => {
      await tx.transaction.findUniqueOrThrow({ where: { id } });
      return current.filter((t) => t.id !== id);
    },
    (tx) => tx.transaction.delete({ where: { id } }),
  );
}
