import { describe, it, expect, vi } from 'vitest';
import { setupApi } from '../helpers/api.js';
import { allProviders, routeFetch, callsTo, status, hang, json, BODIES, MATCH } from '../helpers/fetchMock.js';
import {
  fetchBtcUsd,
  fetchUsdTzs,
  refreshPrices,
  getLatestPrice,
} from '../../src/services/prices/price.service.js';
import { runPriceJob } from '../../src/jobs/price.job.js';

const api = setupApi();

const snapshotCount = () => api.prisma.priceSnapshot.count();
const seedSnapshot = (data) =>
  api.prisma.priceSnapshot.create({ data: { btcUsd: '84000', usdTzs: '2650', ...data } });

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('BTC/USD provider fallback', () => {
  it('uses the first provider when it answers', async () => {
    const fetchMock = allProviders();
    const result = await fetchBtcUsd();
    expect(result.source).toBe('coingecko');
    expect(result.value.toString()).toBe('84721');
    expect(callsTo(fetchMock, MATCH.coinbase)).toBe(0);
  });

  it('retries a failing provider twice, then falls back to the next one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = allProviders({ coingecko: status(503) });

    const result = await fetchBtcUsd();

    expect(result).toMatchObject({ source: 'coinbase' });
    expect(result.value.toString()).toBe('84736.785');
    expect(callsTo(fetchMock, MATCH.coingecko)).toBe(3); // 1 try + 2 retries
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"coingecko" failed: HTTP 503 \(after 3 attempts\)/));
  });

  it('falls back when the first provider times out', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = allProviders({ coingecko: hang });

    const result = await fetchBtcUsd();

    expect(result.source).toBe('coinbase');
    expect(callsTo(fetchMock, MATCH.coingecko)).toBe(3);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"coingecko" failed: timed out after 200ms/));
  });

  it('does not retry a 4xx other than 429', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = allProviders({ coingecko: status(401) });
    await fetchBtcUsd();
    expect(callsTo(fetchMock, MATCH.coingecko)).toBe(1);
  });

  it('recovers when a retry succeeds', async () => {
    let calls = 0;
    const fetchMock = allProviders({
      coingecko: () => (++calls === 1 ? json({}, 502) : json(BODIES.coingecko)),
    });
    expect((await fetchBtcUsd()).source).toBe('coingecko');
    expect(callsTo(fetchMock, MATCH.coingecko)).toBe(2);
  });

  it('treats a changed response shape or a non-positive price as a failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    allProviders({
      coingecko: { bitcoin: { usd: 0 } },
      coinbase: { data: { price: '84000' } },
    });

    const result = await fetchBtcUsd();

    expect(result.source).toBe('kraken');
    expect(result.value.toString()).toBe('84720.6');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"coingecko" failed: unexpected response shape: bitcoin.usd/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"coinbase" failed: unexpected response shape: data.amount/));
  });

  it('reports Kraken API errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    allProviders({
      coingecko: status(500),
      coinbase: status(500),
      kraken: { error: ['EGeneral:Temporary lockout'], result: {} },
    });
    await expect(fetchBtcUsd()).rejects.toMatchObject({ status: 502 });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Kraken error: EGeneral:Temporary lockout/));
  });
});

describe('USD/TZS providers and cache', () => {
  it('falls back to currency-api when open.er-api fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    allProviders({ erApi: { result: 'error', 'error-type': 'unknown' } });
    const result = await fetchUsdTzs();
    expect(result.source).toBe('currency-api');
    expect(result.value.toString()).toBe('2647.19784399');
  });

  it('caches the rate for FX_CACHE_HOURS', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    const fetchMock = allProviders();

    expect(await fetchUsdTzs()).toMatchObject({ source: 'open.er-api', cached: false });
    vi.setSystemTime(new Date('2026-09-27T17:59:00Z'));
    expect(await fetchUsdTzs()).toMatchObject({ source: 'open.er-api', cached: true });
    expect(callsTo(fetchMock, MATCH.erApi)).toBe(1);

    vi.setSystemTime(new Date('2026-09-27T18:00:01Z')); // > 6h later
    expect(await fetchUsdTzs()).toMatchObject({ cached: false });
    expect(callsTo(fetchMock, MATCH.erApi)).toBe(2);
  });
});

describe('refreshPrices', () => {
  it('saves one snapshot with rounded values and reports sources', async () => {
    allProviders({ coingecko: status(500) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await refreshPrices();

    expect(result).toMatchObject({
      btcUsd: '84736.79', // coinbase 84736.785, ROUND_HALF_UP to 2 dp
      usdTzs: '2656.3489', // 2656.348863 to 4 dp
      btcTzs: '225090478.91', // 84736.79 * 2656.3489 = 225,090,478.906031
      stale: false,
      sources: { btcUsd: 'coinbase', usdTzs: 'open.er-api' },
    });
    const saved = await api.prisma.priceSnapshot.findMany();
    expect(saved).toHaveLength(1);
    expect(saved[0].btcUsd.toFixed(2)).toBe('84736.79');
    expect(saved[0].usdTzs.toFixed(4)).toBe('2656.3489');
  });

  it('marks a cached FX rate in the sources', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = allProviders();
    await refreshPrices();
    const second = await refreshPrices();
    expect(second.sources.usdTzs).toBe('open.er-api (cached)');
    expect(callsTo(fetchMock, MATCH.erApi)).toBe(1);
    expect(callsTo(fetchMock, MATCH.coingecko)).toBe(2);
  });

  it('saves nothing when every BTC provider fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await seedSnapshot({ timestamp: new Date(Date.now() - HOUR) });
    const fetchMock = allProviders({ coingecko: status(500), coinbase: hang, kraken: status(404) });

    const err = await refreshPrices().catch((e) => e);

    expect(err).toMatchObject({ status: 502, message: 'All BTC/USD providers failed' });
    expect(err.details.failures.map((f) => f.provider)).toEqual(['coingecko', 'coinbase', 'kraken']);
    expect(await snapshotCount()).toBe(1);
    expect(callsTo(fetchMock, MATCH.erApi)).toBe(0); // BTC is fetched first
  });

  it('reuses the previous usdTzs when every FX provider fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await seedSnapshot({ btcUsd: '84000', usdTzs: '2600.1234', timestamp: new Date(Date.now() - HOUR) });
    allProviders({ erApi: status(500), currencyApi: hang });

    const result = await refreshPrices();

    expect(result).toMatchObject({
      btcUsd: '84721.00',
      usdTzs: '2600.1234',
      sources: { btcUsd: 'coingecko', usdTzs: 'previous_snapshot' },
    });
    expect(await snapshotCount()).toBe(2);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/reusing previous usdTzs 2600.1234/));
  });

  it('saves nothing when every FX provider fails and there is no previous snapshot', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    allProviders({ erApi: status(500), currencyApi: status(500) });
    await expect(refreshPrices()).rejects.toMatchObject({ status: 502 });
    expect(await snapshotCount()).toBe(0);
  });

  it('rejects a BTC price more than 50% away from the previous snapshot', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await seedSnapshot({ btcUsd: '50000', timestamp: new Date(Date.now() - HOUR) });
    allProviders(); // 84721 is +69%

    const err = await refreshPrices().catch((e) => e);

    expect(err.status).toBe(502);
    expect(err.message).toMatch(/Rejected btcUsd 84721 from coingecko: 69.44% away from previous 50000/);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Rejected btcUsd.*Snapshot not saved/));
    expect(await snapshotCount()).toBe(1);
  });

  it('rejects a drop of more than 50% too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await seedSnapshot({ btcUsd: '84000' });
    allProviders({ coingecko: { bitcoin: { usd: 41000 } } }); // -51.2%
    await expect(refreshPrices()).rejects.toMatchObject({ status: 502 });
    expect(await snapshotCount()).toBe(1);
  });

  it('accepts a change within 50%', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await seedSnapshot({ btcUsd: '57000', usdTzs: '1800' }); // +48.6% / +47.6%
    allProviders();
    await refreshPrices();
    expect(await snapshotCount()).toBe(2);
  });

  it('rejects an FX rate more than 50% away and does not keep it cached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await seedSnapshot({ btcUsd: '84000', usdTzs: '1000' });
    const fetchMock = allProviders();

    await expect(refreshPrices()).rejects.toMatchObject({ message: expect.stringMatching(/Rejected usdTzs/) });
    await expect(refreshPrices()).rejects.toThrow();
    expect(callsTo(fetchMock, MATCH.erApi)).toBe(2); // refetched, not served from cache
    expect(await snapshotCount()).toBe(1);
  });
});

describe('getLatestPrice', () => {
  it('returns null with no snapshots', async () => {
    expect(await getLatestPrice()).toBeNull();
  });

  it('flags prices older than PRICE_STALE_MINUTES (60) as stale', async () => {
    await seedSnapshot({ timestamp: new Date(Date.now() - 61 * MINUTE) });
    expect(await getLatestPrice()).toMatchObject({ stale: true });

    await seedSnapshot({ btcUsd: '85000.5', usdTzs: '2650', timestamp: new Date(Date.now() - 5 * MINUTE) });
    expect(await getLatestPrice()).toMatchObject({
      btcUsd: '85000.50',
      usdTzs: '2650.0000',
      btcTzs: '225251325.00',
      stale: false,
    });
  });
});

describe('price job', () => {
  it('skips a run while the previous one is still in progress', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let finish;
    const refresh = vi.fn(() => new Promise((resolve) => (finish = resolve)));

    const first = runPriceJob(refresh);
    expect(await runPriceJob(refresh)).toEqual({ status: 'skipped' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/still in progress/));

    finish({ id: 1 });
    expect(await first).toEqual({ status: 'ok', snapshot: { id: 1 } });

    // The guard is released afterwards.
    expect((await runPriceJob(async () => ({ id: 2 }))).status).toBe('ok');
  });

  it('never throws; failures are logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runPriceJob(async () => {
      throw new Error('boom');
    });
    expect(result.status).toBe('failed');
    expect(error).toHaveBeenCalledWith('[price-job] Refresh failed: boom');
    // and the guard is released after a failure too
    expect((await runPriceJob(async () => ({ id: 3 }))).status).toBe('ok');
  });

  it('runs the real refresh end to end', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    allProviders();
    const result = await runPriceJob();
    expect(result.status).toBe('ok');
    expect(await snapshotCount()).toBe(1);
  });

  it('does not reach the network when fetch is not mocked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runPriceJob();
    expect(result.status).toBe('failed');
    expect(fetch).toHaveBeenCalled();
    expect(fetch.mock.calls.every(([u]) => typeof u === 'string')).toBe(true);
  });
});

// Make sure routeFetch-based mocks fail loudly for unknown URLs.
it('mocks reject unknown URLs', async () => {
  routeFetch({ 'example.test': { ok: true } });
  await expect(fetch('https://unknown.test/')).rejects.toThrow(/Unexpected network call/);
});
