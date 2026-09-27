import { describe, it, expect, vi } from 'vitest';
import { setupApi } from '../helpers/api.js';
import { allProviders, routeFetch, callsTo, json, MATCH } from '../helpers/fetchMock.js';

const api = setupApi();

const MINUTE = 60 * 1000;
const at = (iso) => new Date(iso);

describe('GET /prices/latest', () => {
  it('404s before any snapshot exists', async () => {
    const res = await api.get('/prices/latest');
    expect(res.status).toBe(404);
  });

  it('returns the latest snapshot with a stale flag', async () => {
    await api.prisma.priceSnapshot.create({
      data: { btcUsd: '80000', usdTzs: '2600', timestamp: new Date(Date.now() - 3 * 60 * MINUTE) },
    });
    const old = await api.get('/prices/latest');
    expect(old.body).toMatchObject({ btcUsd: '80000.00', stale: true });

    await api.prisma.priceSnapshot.create({ data: { btcUsd: '84721', usdTzs: '2656.3489' } });
    const res = await api.get('/prices/latest');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      btcUsd: '84721.00',
      usdTzs: '2656.3489',
      btcTzs: '225048535.16', // 84721 * 2656.3489 = 225,048,535.1569
      timestamp: expect.any(String),
      stale: false,
    });
  });
});

describe('POST /prices/refresh', () => {
  it('refreshes now, then is rate limited to once per minute', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = allProviders();

    const first = await api.post('/prices/refresh');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      btcUsd: '84721.00',
      usdTzs: '2656.3489',
      stale: false,
      sources: { btcUsd: 'coingecko', usdTzs: 'open.er-api' },
    });
    expect(await api.prisma.priceSnapshot.count()).toBe(1);

    const second = await api.post('/prices/refresh');
    expect(second.status).toBe(429);
    expect(second.body.error).toMatch(/once per minute/);
    expect(callsTo(fetchMock, MATCH.coingecko)).toBe(1);
    expect(await api.prisma.priceSnapshot.count()).toBe(1);
  });
});

describe('GET /prices/history', () => {
  const seed = () =>
    api.prisma.priceSnapshot.createMany({
      data: [
        { timestamp: at('2026-09-01T10:05:00Z'), btcUsd: '80000', usdTzs: '2600' },
        { timestamp: at('2026-09-01T10:40:00Z'), btcUsd: '80100', usdTzs: '2600' },
        { timestamp: at('2026-09-01T11:10:00Z'), btcUsd: '80200', usdTzs: '2601' },
        { timestamp: at('2026-09-01T11:50:00Z'), btcUsd: '80300', usdTzs: '2602' },
        { timestamp: at('2026-09-02T12:00:00Z'), btcUsd: '81000', usdTzs: '2610' },
      ],
    });

  it('returns raw points oldest first', async () => {
    await seed();
    const res = await api.get('/prices/history');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ interval: 'raw', count: 5, truncated: false, from: null, to: null });
    expect(res.body.points.map((p) => p.btcUsd)).toEqual(['80000.00', '80100.00', '80200.00', '80300.00', '81000.00']);
    expect(res.body.points[0]).toEqual({
      btcUsd: '80000.00',
      usdTzs: '2600.0000',
      btcTzs: '208000000.00',
      timestamp: '2026-09-01T10:05:00.000Z',
    });
  });

  it('hourly returns the last snapshot in each hour', async () => {
    await seed();
    const res = await api.get('/prices/history?interval=hourly');
    expect(res.body.points.map((p) => [p.bucket, p.timestamp, p.btcUsd])).toEqual([
      ['2026-09-01T10:00:00.000Z', '2026-09-01T10:40:00.000Z', '80100.00'],
      ['2026-09-01T11:00:00.000Z', '2026-09-01T11:50:00.000Z', '80300.00'],
      ['2026-09-02T12:00:00.000Z', '2026-09-02T12:00:00.000Z', '81000.00'],
    ]);
  });

  it('daily returns the last snapshot in each UTC day', async () => {
    await seed();
    const res = await api.get('/prices/history?interval=daily');
    expect(res.body.points.map((p) => [p.bucket, p.btcUsd])).toEqual([
      ['2026-09-01T00:00:00.000Z', '80300.00'],
      ['2026-09-02T00:00:00.000Z', '81000.00'],
    ]);
  });

  it('filters by from/to (a plain "to" date includes that whole day)', async () => {
    await seed();
    const res = await api.get('/prices/history?from=2026-09-01T11:00:00Z&to=2026-09-01');
    expect(res.body.points.map((p) => p.btcUsd)).toEqual(['80200.00', '80300.00']);
    expect(res.body.to).toBe('2026-09-01T23:59:59.999Z');
  });

  it('caps at the most recent 1000 points', async () => {
    const start = at('2026-01-01T00:00:00Z').getTime();
    await api.prisma.priceSnapshot.createMany({
      data: Array.from({ length: 1005 }, (_, i) => ({
        timestamp: new Date(start + i * MINUTE),
        btcUsd: String(80000 + i),
        usdTzs: '2600',
      })),
    });

    const res = await api.get('/prices/history?interval=raw');
    expect(res.body.count).toBe(1000);
    expect(res.body.truncated).toBe(true);
    expect(res.body.points[0].btcUsd).toBe('80005.00');
    expect(res.body.points.at(-1).btcUsd).toBe('81004.00');

    const hourly = await api.get('/prices/history?interval=hourly');
    expect(hourly.body).toMatchObject({ count: 17, truncated: false }); // 1005 minutes span 17 hours
  });

  it('validates the query', async () => {
    expect((await api.get('/prices/history?interval=weekly')).status).toBe(400);
    expect((await api.get('/prices/history?from=nope')).status).toBe(400);
    expect((await api.get('/prices/history?from=2026-09-02&to=2026-09-01')).status).toBe(400);
  });
});

describe('GET /prices/fx', () => {
  it('uses the latest snapshot for today', async () => {
    await api.prisma.priceSnapshot.create({ data: { btcUsd: '84721', usdTzs: '2656.3489' } });
    const today = new Date().toISOString().slice(0, 10);

    const res = await api.get(`/prices/fx?date=${today}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: today, usdTzs: '2656.3489', source: 'latest_snapshot' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('looks up and caches historical rates', async () => {
    const fetchMock = routeFetch({
      [MATCH.dated('2026-01-10')]: { date: '2026-01-10', usd: { tzs: 2498.62509244 } },
    });

    const res = await api.get('/prices/fx?date=2026-01-10');
    expect(res.body).toEqual({
      date: '2026-01-10',
      usdTzs: '2498.6251',
      source: 'historical_lookup',
      asOf: '2026-01-10',
    });
    await api.get('/prices/fx?date=2026-01-10');
    expect(callsTo(fetchMock, '2026-01-10')).toBe(1);
  });

  it('404s when no rate is published', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    routeFetch({ '@fawazahmed0/currency-api@': () => json({ error: 'not found' }, 404) });
    const res = await api.get('/prices/fx?date=2023-06-01');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Enter it manually/);
  });

  it('validates the date', async () => {
    expect((await api.get('/prices/fx')).status).toBe(400);
    expect((await api.get('/prices/fx?date=10-01-2026')).status).toBe(400);
    expect((await api.get('/prices/fx?date=2999-01-01')).status).toBe(400);
  });
});

describe('portfolio summary price', () => {
  it('includes the stale flag', async () => {
    await api.prisma.priceSnapshot.create({
      data: { btcUsd: '84721', usdTzs: '2656.3489', timestamp: new Date(Date.now() - 2 * 60 * MINUTE) },
    });
    const res = await api.get('/portfolio/summary');
    expect(res.body.price).toMatchObject({ btcUsd: '84721.00', stale: true });
  });
});
