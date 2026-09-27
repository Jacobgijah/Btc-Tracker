import { describe, it, expect } from 'vitest';
import { setupApi } from '../helpers/api.js';

const api = setupApi();

const buy = (overrides = {}) => ({
  type: 'BUY',
  date: '2026-01-10T00:00:00Z',
  sats: 1_000_000,
  fiatAmount: '2500000',
  feeAmount: '25000',
  fiatCurrency: 'TZS',
  usdTzsRate: '2500',
  ...overrides,
});

const sell = (overrides = {}) => ({
  type: 'SELL',
  date: '2026-03-10T00:00:00Z',
  sats: 300_000,
  fiatAmount: '330',
  feeAmount: '3',
  fiatCurrency: 'USD',
  usdTzsRate: '2650',
  ...overrides,
});

/** Creates a transaction; returns it as stored (usdTzsRateSource is only on the POST response). */
async function create(body) {
  const res = await api.post('/transactions', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const { usdTzsRateSource, ...stored } = res.body;
  expect(usdTzsRateSource).toBe('provided');
  return stored;
}

describe('CRUD', () => {
  it('creates a transaction and returns it with string numbers', async () => {
    const res = await api.post('/transactions', buy({ exchange: 'Binance', note: 'first stack' }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      type: 'BUY',
      date: '2026-01-10T00:00:00.000Z',
      sats: '1000000',
      btc: '0.01000000',
      fiatAmount: '2500000.00',
      feeAmount: '25000.00',
      fiatCurrency: 'TZS',
      usdTzsRate: '2500.0000',
      exchange: 'Binance',
      note: 'first stack',
    });
    expect(res.body.createdAt).toEqual(expect.any(String));
  });

  it('accepts btc instead of sats and stores exact sats', async () => {
    const t = await create(buy({ sats: undefined, btc: '0.01234567' }));
    expect(t.sats).toBe('1234567');
    expect(t.btc).toBe('0.01234567');
  });

  it('accepts sats as a string and numbers for fiat', async () => {
    const t = await create(buy({ sats: '2100000000000000', fiatAmount: 1000, feeAmount: 0 }));
    expect(t.sats).toBe('2100000000000000');
    expect(t.fiatAmount).toBe('1000.00');
  });

  it('defaults feeAmount to 0 and accepts a plain date', async () => {
    const t = await create(buy({ feeAmount: undefined, date: '2026-01-10' }));
    expect(t.feeAmount).toBe('0.00');
    expect(t.date).toBe('2026-01-10T00:00:00.000Z');
  });

  it('gets one by id, 404 when missing, 400 for a bad id', async () => {
    const t = await create(buy());
    expect((await api.get(`/transactions/${t.id}`)).body).toEqual(t);
    expect((await api.get('/transactions/9999')).status).toBe(404);
    expect((await api.get('/transactions/abc')).status).toBe(400);
  });

  it('lists newest first with pagination and total', async () => {
    const a = await create(buy({ date: '2026-01-01T00:00:00Z' }));
    const b = await create(buy({ date: '2026-02-01T00:00:00Z' }));
    const c = await create(buy({ date: '2026-02-01T00:00:00Z' })); // same date, higher id
    const d = await create(sell({ date: '2026-03-01T00:00:00Z' }));

    const all = await api.get('/transactions');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(4);
    expect(all.body.page).toBe(1);
    expect(all.body.pageSize).toBe(50);
    expect(all.body.data.map((t) => t.id)).toEqual([d.id, c.id, b.id, a.id]);

    const page2 = await api.get('/transactions?page=2&pageSize=3');
    expect(page2.body).toMatchObject({ page: 2, pageSize: 3, total: 4 });
    expect(page2.body.data.map((t) => t.id)).toEqual([a.id]);
  });

  it('filters by type and date range (plain "to" date includes the whole day)', async () => {
    await create(buy({ date: '2026-01-01T00:00:00Z' }));
    const feb = await create(buy({ date: '2026-02-01T18:30:00Z' }));
    const mar = await create(sell({ date: '2026-03-01T00:00:00Z' }));

    const sells = await api.get('/transactions?type=SELL');
    expect(sells.body.data.map((t) => t.id)).toEqual([mar.id]);

    const range = await api.get('/transactions?from=2026-01-15&to=2026-02-01');
    expect(range.body.data.map((t) => t.id)).toEqual([feb.id]);
    expect(range.body.total).toBe(1);
  });

  it('rejects bad list queries', async () => {
    expect((await api.get('/transactions?pageSize=201')).status).toBe(400);
    expect((await api.get('/transactions?page=0')).status).toBe(400);
    expect((await api.get('/transactions?type=GIFT')).status).toBe(400);
    expect((await api.get('/transactions?from=yesterday')).status).toBe(400);
    expect((await api.get('/transactions?from=2026-03-01&to=2026-01-01')).status).toBe(400);
  });

  it('patches only the given fields', async () => {
    const t = await create(buy());
    const res = await api.patch(`/transactions/${t.id}`, { note: 'edited', fiatAmount: '2600000.5' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...t, note: 'edited', fiatAmount: '2600000.50', updatedAt: expect.any(String) });
  });

  it('patches the amount via btc and can clear optional text', async () => {
    const t = await create(buy({ exchange: 'Binance' }));
    const res = await api.patch(`/transactions/${t.id}`, { btc: '0.5', exchange: null });
    expect(res.body.sats).toBe('50000000');
    expect(res.body.exchange).toBeNull();
  });

  it('404 when patching or deleting a missing transaction', async () => {
    expect((await api.patch('/transactions/9999', { note: 'x' })).status).toBe(404);
    expect((await api.del('/transactions/9999')).status).toBe(404);
  });

  it('deletes', async () => {
    const t = await create(buy());
    const res = await api.del(`/transactions/${t.id}`);
    expect(res.status).toBe(204);
    expect((await api.get(`/transactions/${t.id}`)).status).toBe(404);
  });
});

describe('validation (400)', () => {
  const invalid = [
    ['both sats and btc', buy({ btc: '0.01' }), 'btc'],
    ['neither sats nor btc', buy({ sats: undefined }), 'sats'],
    ['btc with 9 dp', buy({ sats: undefined, btc: '0.000000001' }), 'btc'],
    ['btc as a number', buy({ sats: undefined, btc: 0.01 }), 'btc'],
    ['zero btc', buy({ sats: undefined, btc: '0.00000000' }), 'btc'],
    ['fractional sats', buy({ sats: 1.5 }), 'sats'],
    ['zero sats', buy({ sats: 0 }), 'sats'],
    ['more sats than will ever exist', buy({ sats: '2100000000000001' }), 'sats'],
    ['fiatAmount with 3 dp', buy({ fiatAmount: '1.005' }), 'fiatAmount'],
    ['float noise in fiatAmount', buy({ fiatAmount: 0.1 + 0.2 }), 'fiatAmount'],
    ['negative fiatAmount', buy({ fiatAmount: '-5' }), 'fiatAmount'],
    ['zero fiatAmount on a BUY', buy({ fiatAmount: '0' }), 'fiatAmount'],
    ['zero fiatAmount on a SELL', sell({ fiatAmount: '0', feeAmount: '0' }), 'fiatAmount'],
    ['fee equal to fiatAmount on a SELL', sell({ fiatAmount: '10', feeAmount: '10' }), 'feeAmount'],
    ['negative fee', buy({ feeAmount: '-1' }), 'feeAmount'],
    ['unknown currency', buy({ fiatCurrency: 'EUR' }), 'fiatCurrency'],
    ['unknown type', buy({ type: 'GIFT' }), 'type'],
    ['zero usdTzsRate', buy({ usdTzsRate: '0' }), 'usdTzsRate'],
    ['usdTzsRate with 5 dp', buy({ usdTzsRate: '2500.00001' }), 'usdTzsRate'],
    ['future date', buy({ date: '2999-01-01T00:00:00Z' }), 'date'],
    ['non-ISO date', buy({ date: '10/01/2026' }), 'date'],
    ['exchange over 100 chars', buy({ exchange: 'x'.repeat(101) }), 'exchange'],
    ['note over 500 chars', buy({ note: 'x'.repeat(501) }), 'note'],
  ];

  it.each(invalid)('rejects %s', async (_label, body, field) => {
    const res = await api.post('/transactions', body);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty(field);
  });

  it('rejects unknown fields', async () => {
    const res = await api.post('/transactions', buy({ amount: 5 }));
    expect(res.status).toBe(400);
    expect(res.body.formErrors.join(' ')).toMatch(/amount/);
  });

  it('allows fiatAmount 0 for TRANSFER_IN', async () => {
    const t = await create(buy({ type: 'TRANSFER_IN', fiatAmount: '0', feeAmount: '0' }));
    expect(t.fiatAmount).toBe('0.00');
  });

  it('re-checks cross-field rules against the stored row on PATCH', async () => {
    await create(buy());
    const s = await create(sell({ fiatAmount: '330', feeAmount: '3' }));

    const res = await api.patch(`/transactions/${s.id}`, { fiatAmount: '2' }); // below the stored fee
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty('feeAmount');
    expect((await api.get(`/transactions/${s.id}`)).body.fiatAmount).toBe('330.00');
  });

  it('rejects an empty PATCH and sats+btc together', async () => {
    const t = await create(buy());
    expect((await api.patch(`/transactions/${t.id}`, {})).status).toBe(400);
    expect((await api.patch(`/transactions/${t.id}`, { sats: 1, btc: '1' })).status).toBe(400);
  });
});

describe('ledger integrity (422)', () => {
  it('rejects a sell larger than holdings and writes nothing', async () => {
    await create(buy({ sats: 1_000_000 }));
    const res = await api.post('/transactions', sell({ sats: 1_000_001 }));

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/exceeds holdings/);
    expect(res.body.details).toMatchObject({
      transactionId: null, // the new, unsaved transaction
      date: '2026-03-10T00:00:00.000Z',
      attemptedSats: '1000001',
      availableSats: '1000000',
    });
    expect((await api.get('/transactions')).body.total).toBe(1);
  });

  it('rejects deleting an earlier buy that a later sell depends on', async () => {
    const b = await create(buy({ sats: 1_000_000 }));
    const s = await create(sell({ sats: 300_000 }));

    const res = await api.del(`/transactions/${b.id}`);
    expect(res.status).toBe(422);
    expect(res.body.details).toMatchObject({ transactionId: s.id, date: s.date });
    expect((await api.get(`/transactions/${b.id}`)).status).toBe(200);
  });

  it('rejects backdating a sell to before the buy', async () => {
    await create(buy({ date: '2026-01-10T00:00:00Z' }));
    const s = await create(sell({ date: '2026-03-10T00:00:00Z' }));

    const res = await api.patch(`/transactions/${s.id}`, { date: '2026-01-01T00:00:00Z' });
    expect(res.status).toBe(422);
    expect(res.body.details).toMatchObject({ transactionId: s.id, date: '2026-01-01T00:00:00.000Z' });
    expect((await api.get(`/transactions/${s.id}`)).body.date).toBe('2026-03-10T00:00:00.000Z');
  });

  it('rejects a new backdated sell that breaks a later existing sell', async () => {
    await create(buy({ sats: 1_000_000 }));
    const later = await create(sell({ sats: 800_000, date: '2026-03-10T00:00:00Z' }));

    const res = await api.post('/transactions', sell({ sats: 300_000, date: '2026-02-01T00:00:00Z' }));
    expect(res.status).toBe(422);
    expect(res.body.details.transactionId).toBe(later.id);
    expect((await api.get('/transactions')).body.total).toBe(2);
  });

  it('rejects reducing a buy below what was later sold', async () => {
    const b = await create(buy({ sats: 1_000_000 }));
    await create(sell({ sats: 800_000 }));
    expect((await api.patch(`/transactions/${b.id}`, { sats: 500_000 })).status).toBe(422);
  });

  it('allows selling the entire position', async () => {
    await create(buy({ sats: 1_000_000 }));
    await create(sell({ sats: 1_000_000 }));
  });
});
