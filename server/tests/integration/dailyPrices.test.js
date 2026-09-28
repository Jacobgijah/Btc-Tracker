import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupApi } from '../helpers/api.js';
import { routeFetch, json, status, MATCH, HISTORY_BODIES } from '../helpers/fetchMock.js';
import {
  backfillDailyPrices,
  backfillDefaults,
  formatBackfillReport,
  rollupDailyPrices,
} from '../../src/services/prices/dailyPrice.service.js';
import { runDailyPriceJob, startDailyPriceJob } from '../../src/jobs/dailyPrice.job.js';
import { fetchDailyCloses as coinbaseCloses } from '../../src/services/prices/providers/coinbase.js';
import { fetchDailyCloses as krakenCloses } from '../../src/services/prices/providers/kraken.js';
import { fetchPublishedDays, fetchUsdTzsForDate } from '../../src/services/prices/providers/currencyApi.js';
import { eachDay } from '../../src/lib/days.js';

const api = setupApi();

// 09:00 UTC = 12:00 in Dar es Salaam (APP_TIMEZONE default): today 2026-03-20, yesterday 2026-03-19.
const NOW = new Date('2026-03-20T09:00:00Z');

// A deterministic fake market. Coinbase sends JSON numbers, currency-api too.
const dayNumber = (day) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
const btcFor = (day) => 60000 + (dayNumber(day) % 5000) + 0.5;
const fxFor = (day) => 2500 + (dayNumber(day) % 200) + 0.123456;
const btcStored = (day) => `${60000 + (dayNumber(day) % 5000)}.50`;
const fxStored = (day) => `${2500 + (dayNumber(day) % 200)}.1235`; // 4 dp, half up
const unix = (day) => dayNumber(day) * 86_400;

/**
 * Installs a fetch mock for the history providers and records what was asked.
 * - coinbaseMissing: days Coinbase has no candle for
 * - krakenDays: days Kraken's OHLC contains
 * - published: days currency-api has a release for (null: metadata call fails)
 */
function market({ coinbaseMissing = [], krakenDays = [], published = [], coinbase } = {}) {
  const calls = { coinbase: [], kraken: 0, metadata: 0, fx: [] };
  const publishedSet = new Set(published ?? []);
  const fetchMock = routeFetch({
    [MATCH.coinbaseCandles]:
      coinbase ??
      ((url) => {
        const params = new URL(url).searchParams;
        const [start, end] = [params.get('start').slice(0, 10), params.get('end').slice(0, 10)];
        calls.coinbase.push([start, end]);
        const days = eachDay(start, end);
        if (days.length > 300) {
          return json({ message: 'granularity too small for the requested time range. Count of aggregations requested exceeds 300' }, 400);
        }
        return json(
          days
            .filter((d) => !coinbaseMissing.includes(d))
            .reverse()
            .map((d) => [unix(d), 1, 2, 1.5, btcFor(d), 10.5]),
        );
      }),
    [MATCH.krakenOhlc]: () => {
      calls.kraken += 1;
      const rows = krakenDays.map((d) => [unix(d), '1', '2', '0.5', `${btcFor(d) + 1}`, '1', '1', 5]);
      return json({ error: [], result: { XXBTZUSD: rows, last: 0 } });
    },
    [MATCH.jsdelivrMetadata]: () => {
      calls.metadata += 1;
      if (published === null) return json({ status: 500 }, 500);
      return json({ tags: { ...Object.fromEntries([...publishedSet].map((d) => [d, d.replaceAll('-', '.')])), latest: 'x' } });
    },
    [MATCH.anyDated]: (url) => {
      const day = String(url).match(/currency-api@(\d{4}-\d{2}-\d{2})\//)[1];
      calls.fx.push(day);
      if (!publishedSet.has(day)) return json(`Couldn't find the requested release version ${day}.`, 404);
      return json({ date: day, usd: { usd: 1, tzs: fxFor(day) } });
    },
  });
  return { calls, fetchMock };
}

const rows = async () =>
  (await api.prisma.dailyPrice.findMany({ orderBy: { date: 'asc' } })).map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    btcUsd: r.btcUsd.toFixed(2),
    usdTzs: r.usdTzs.toFixed(4),
    btcSource: r.btcSource,
    fxSource: r.fxSource,
  }));

const seedDaily = (date, data = {}) =>
  api.prisma.dailyPrice.create({
    data: { date: new Date(`${date}T00:00:00Z`), btcUsd: '1', usdTzs: '1', btcSource: 'coinbase', fxSource: 'currency-api', ...data },
  });

beforeEach(() => {
  backfillDefaults.throttleMs = 0;
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  backfillDefaults.throttleMs = 250;
});

describe('providers parse the captured real responses', () => {
  it('Coinbase candles, Kraken OHLC, jsDelivr metadata, dated currency-api', async () => {
    routeFetch({
      [MATCH.coinbaseCandles]: HISTORY_BODIES.coinbaseCandles,
      [MATCH.krakenOhlc]: HISTORY_BODIES.krakenOhlc,
      [MATCH.jsdelivrMetadata]: HISTORY_BODIES.jsdelivrMetadata,
      [MATCH.dated('2026-09-20')]: HISTORY_BODIES.currencyApiDated,
    });

    const cb = await coinbaseCloses('2026-09-20', '2026-09-22');
    expect(Object.fromEntries([...cb].map(([d, v]) => [d, v.toString()]))).toEqual({
      '2026-09-20': '81159.64',
      '2026-09-21': '86594.94',
      '2026-09-22': '86198.05',
    });
    const kr = await krakenCloses();
    // [time, open, high, low, close, vwap, volume, count]: close, not vwap
    expect(Object.fromEntries([...kr].map(([d, v]) => [d, v.toString()]))).toEqual({
      '2026-09-24': '84380',
      '2026-09-25': '84090.5',
    });
    expect([...(await fetchPublishedDays())]).toEqual(['2024-03-02', '2024-03-03']);
    expect((await fetchUsdTzsForDate('2026-09-20')).toString()).toBe('2643.45091116');
  });
});

describe('backfillDailyPrices', () => {
  const FROM = '2024-02-25';
  const TO = '2024-03-05';
  // currency-api starts 2024-03-02; pretend 2024-03-04 was never published.
  const PUBLISHED = ['2024-03-02', '2024-03-03', '2024-03-05'];

  it('fills every day and carries FX forward (or back) where none was published', async () => {
    const { calls } = market({ published: PUBLISHED });

    const report = await backfillDailyPrices({ from: FROM, to: TO, now: NOW });

    expect(report).toMatchObject({
      from: FROM,
      to: TO,
      daysInRange: 10,
      alreadyPresent: 0,
      filled: 10,
      btcSources: { coinbase: 10 },
      fxSources: { 'currency-api': 3, carried_forward: 7 },
      carriedForward: [
        { from: '2024-02-25', to: '2024-03-01', days: 6 },
        { from: '2024-03-04', to: '2024-03-04', days: 1 },
      ],
      gaps: { btc: [], fx: [] },
      warnings: [],
    });
    // One candle request, one metadata request, and FX only for published days.
    expect(calls.coinbase).toEqual([[FROM, TO]]);
    expect(calls.fx).toEqual(PUBLISHED);
    expect(report.requests).toBe(5);

    const saved = await rows();
    expect(saved).toHaveLength(10);
    // Before the first published day: the nearest later rate
    expect(saved[0]).toEqual({
      date: '2024-02-25',
      btcUsd: btcStored('2024-02-25'),
      usdTzs: fxStored('2024-03-02'),
      btcSource: 'coinbase',
      fxSource: 'carried_forward',
    });
    expect(saved.find((r) => r.date === '2024-03-03')).toMatchObject({ usdTzs: fxStored('2024-03-03'), fxSource: 'currency-api' });
    // A missing day in between: the nearest earlier rate
    expect(saved.find((r) => r.date === '2024-03-04')).toMatchObject({ usdTzs: fxStored('2024-03-03'), fxSource: 'carried_forward' });

    const text = formatBackfillReport(report);
    expect(text).toMatch(/USD\/TZS by source:\s+carried_forward 7, currency-api 3/);
    expect(text).toMatch(/2024-02-25 \.\. 2024-03-01 \(6 days\)/);
    expect(text).toMatch(/Gaps \(not written\):\s+none/);
  });

  it('is idempotent: a re-run only fills gaps', async () => {
    const { calls, fetchMock } = market({ published: PUBLISHED });
    await backfillDailyPrices({ from: FROM, to: TO, now: NOW });
    const before = await rows();
    const callCount = fetchMock.mock.calls.length;

    const again = await backfillDailyPrices({ from: FROM, to: TO, now: NOW });
    expect(again).toMatchObject({ alreadyPresent: 10, filled: 0, requests: 0 });
    expect(fetchMock.mock.calls.length).toBe(callCount);
    expect(await rows()).toEqual(before);

    // Remove one day: only that day is fetched again.
    await api.prisma.dailyPrice.delete({ where: { date: new Date('2024-03-03T00:00:00Z') } });
    calls.coinbase.length = 0;
    calls.fx.length = 0;
    const gap = await backfillDailyPrices({ from: FROM, to: TO, now: NOW });
    expect(gap).toMatchObject({ alreadyPresent: 9, filled: 1, fxSources: { 'currency-api': 1 } });
    expect(calls.coinbase).toEqual([['2024-03-03', '2024-03-03']]);
    expect(calls.fx).toEqual(['2024-03-03']);
    expect(await rows()).toEqual(before);
  });

  it('--force re-fetches and overwrites every day', async () => {
    market({ published: PUBLISHED });
    await backfillDailyPrices({ from: FROM, to: TO, now: NOW });
    await api.prisma.dailyPrice.update({ where: { date: new Date('2024-03-03T00:00:00Z') }, data: { btcUsd: '1.00' } });

    const report = await backfillDailyPrices({ from: FROM, to: TO, force: true, now: NOW });

    expect(report).toMatchObject({ alreadyPresent: 10, filled: 10 });
    expect((await rows()).find((r) => r.date === '2024-03-03').btcUsd).toBe(btcStored('2024-03-03'));
    expect(formatBackfillReport(report)).toMatch(/Already present:\s+10 \(re-fetched\)/);
  });

  it('falls back to Kraken for recent days and reports days nobody has', async () => {
    const days = eachDay('2026-03-10', '2026-03-15');
    const { calls } = market({
      coinbaseMissing: ['2026-03-12', '2026-03-13'],
      krakenDays: ['2026-03-11', '2026-03-12'],
      published: days,
    });

    const report = await backfillDailyPrices({ from: '2026-03-10', to: '2026-03-15', now: NOW });

    expect(report).toMatchObject({
      filled: 5,
      btcSources: { coinbase: 4, kraken: 1 },
      gaps: { btc: ['2026-03-13'], fx: [] },
    });
    expect(calls.kraken).toBe(1);
    expect(calls.fx).not.toContain('2026-03-13'); // no FX lookup for a day that can't be written
    const saved = await rows();
    expect(saved.map((r) => r.date)).not.toContain('2026-03-13');
    expect(saved.find((r) => r.date === '2026-03-12')).toMatchObject({ btcSource: 'kraken', btcUsd: `${60000 + (dayNumber('2026-03-12') % 5000) + 1}.50` });
    expect(formatBackfillReport(report)).toMatch(/BTC: 2026-03-13 \(1 day\)/);
  });

  it('does not ask Kraken about days older than its 720-day window', async () => {
    const { calls } = market({ coinbaseMissing: ['2024-01-01'], published: ['2024-01-02'] });
    const report = await backfillDailyPrices({ from: '2024-01-01', to: '2024-01-02', now: NOW });
    expect(calls.kraken).toBe(0);
    expect(report.gaps.btc).toEqual(['2024-01-01']);
  });

  it('pages Coinbase 300 days at a time', async () => {
    const { calls } = market({ published: ['2025-06-01'] });

    const report = await backfillDailyPrices({ from: '2025-01-01', to: '2026-03-19', now: NOW });

    expect(calls.coinbase).toEqual([
      ['2025-01-01', '2025-10-27'], // 300 days
      ['2025-10-28', '2026-03-19'],
    ]);
    expect(report).toMatchObject({ daysInRange: 443, filled: 443, fxSources: { 'currency-api': 1, carried_forward: 442 } });
  });

  it('retries a failing request with backoff', async () => {
    let attempts = 0;
    market({
      published: ['2026-03-18'],
      coinbase: () => (++attempts < 3 ? status(503)() : json([[unix('2026-03-18'), 1, 2, 1, 70000.1, 1]])),
    });
    const report = await backfillDailyPrices({ from: '2026-03-18', to: '2026-03-18', now: NOW });
    expect(attempts).toBe(3);
    expect(report).toMatchObject({ filled: 1, warnings: [] });
  });

  it('logs and continues when a whole source fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    market({ coinbase: status(500), krakenDays: ['2026-03-18'], published: ['2026-03-18'] });
    const report = await backfillDailyPrices({ from: '2026-03-18', to: '2026-03-18', now: NOW });
    expect(report).toMatchObject({ filled: 1, btcSources: { kraken: 1 } });
    expect(report.warnings[0]).toMatch(/Coinbase candles for 2026-03-18 \.\. 2026-03-18 failed: HTTP 500/);
    expect(warn).toHaveBeenCalled();
  });

  it('probes each day when the published-days list is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calls } = market({ published: null });
    const report = await backfillDailyPrices({ from: '2024-03-01', to: '2024-03-02', now: NOW });
    expect(calls.fx).toEqual(['2024-03-01', '2024-03-02']); // both probed; both 404
    expect(report.warnings[0]).toMatch(/Couldn't list published currency-api days/);
  });

  it('uses stored real rates as carry-forward anchors, or the latest snapshot as a last resort', async () => {
    await seedDaily('2024-01-10', { usdTzs: '2400.5' });
    market({ published: [] });
    let report = await backfillDailyPrices({ from: '2024-01-11', to: '2024-01-11', now: NOW });
    expect(report.fxSources).toEqual({ carried_forward: 1 });
    expect((await rows()).at(-1)).toMatchObject({ date: '2024-01-11', usdTzs: '2400.5000' });

    await api.prisma.dailyPrice.deleteMany();
    report = await backfillDailyPrices({ from: '2024-01-11', to: '2024-01-11', now: NOW });
    expect(report).toMatchObject({ filled: 0, gaps: { fx: ['2024-01-11'] } }); // nothing to carry

    await api.prisma.priceSnapshot.create({ data: { btcUsd: '80000', usdTzs: '2650.25' } });
    report = await backfillDailyPrices({ from: '2024-01-11', to: '2024-01-11', now: NOW });
    expect(report.filled).toBe(1);
    expect((await rows())[0]).toMatchObject({ usdTzs: '2650.2500', fxSource: 'carried_forward' });
  });

  it('starts at the first transaction day by default and stops at yesterday', async () => {
    // 22:30 UTC on the 16th is the 17th in Dar es Salaam.
    await api.prisma.transaction.create({
      data: {
        type: 'BUY',
        date: new Date('2026-03-16T22:30:00Z'),
        sats: 1000n,
        fiatAmount: '10',
        fiatCurrency: 'USD',
        usdTzsRate: '2500',
        userId: api.state.user.id,
      },
    });
    market({ published: eachDay('2026-03-01', '2026-03-31') });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const report = await backfillDailyPrices({ to: '2026-03-25', now: NOW });

    expect(report).toMatchObject({ from: '2026-03-17', to: '2026-03-19', filled: 3 });
    expect(report.warnings[0]).toMatch(/2026-03-25 isn't over yet in Africa\/Dar_es_Salaam; stopping at 2026-03-19/);
    expect(warn).toHaveBeenCalled();
  });

  it('asks for --from when there are no transactions', async () => {
    const { fetchMock } = market();
    const report = await backfillDailyPrices({ now: NOW });
    expect(report.note).toMatch(/Pass --from/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(formatBackfillReport(report)).toMatch(/^Backfill: No transactions yet/);
  });
});

describe('rollupDailyPrices (nightly)', () => {
  // Yesterday (2026-03-19) in Dar es Salaam runs 2026-03-18T21:00Z .. 2026-03-19T21:00Z.
  const snapshot = (timestamp, btcUsd, usdTzs = '2600') =>
    api.prisma.priceSnapshot.create({ data: { timestamp: new Date(timestamp), btcUsd, usdTzs } });

  it("writes yesterday from that local day's last snapshot", async () => {
    await seedDaily('2026-03-18');
    await snapshot('2026-03-18T20:59:00Z', '1'); // 23:59 on the 18th, local
    await snapshot('2026-03-19T10:00:00Z', '69000');
    await snapshot('2026-03-19T20:59:30Z', '70000.12', '2612.3456'); // 23:59:30 on the 19th, local
    await snapshot('2026-03-19T21:00:00Z', '99999'); // already the 20th, local
    const { fetchMock } = market();

    const result = await rollupDailyPrices({ now: NOW });

    expect(result).toMatchObject({ status: 'ok', fromSnapshots: ['2026-03-19'], fetched: [] });
    expect((await rows()).at(-1)).toEqual({
      date: '2026-03-19',
      btcUsd: '70000.12',
      usdTzs: '2612.3456',
      btcSource: 'snapshot',
      fxSource: 'snapshot',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Running again changes nothing.
    expect(await rollupDailyPrices({ now: NOW })).toMatchObject({ status: 'up_to_date' });
    expect(await rows()).toHaveLength(2);
  });

  it('fetches days without snapshots like the backfill does, and catches up missed nights', async () => {
    await seedDaily('2026-03-16');
    await snapshot('2026-03-19T12:00:00Z', '70000');
    const { calls } = market({ published: ['2026-03-17', '2026-03-18'] });

    const result = await rollupDailyPrices({ now: NOW });

    expect(result.fromSnapshots).toEqual(['2026-03-19']);
    expect(result.fetched).toHaveLength(1);
    expect(result.fetched[0]).toMatchObject({ from: '2026-03-17', to: '2026-03-18', filled: 2 });
    expect(calls.coinbase).toEqual([['2026-03-17', '2026-03-18']]);
    expect((await rows()).map((r) => [r.date, r.btcSource, r.fxSource])).toEqual([
      ['2026-03-16', 'coinbase', 'currency-api'],
      ['2026-03-17', 'coinbase', 'currency-api'],
      ['2026-03-18', 'coinbase', 'currency-api'],
      ['2026-03-19', 'snapshot', 'snapshot'],
    ]);
  });

  it('only does yesterday on an empty table, and catches up at most maxCatchUpDays', async () => {
    market({ published: eachDay('2026-03-01', '2026-03-31') });
    await rollupDailyPrices({ now: NOW });
    expect((await rows()).map((r) => r.date)).toEqual(['2026-03-19']);

    await api.prisma.dailyPrice.deleteMany();
    await seedDaily('2025-01-01');
    await rollupDailyPrices({ now: NOW, maxCatchUpDays: 3 });
    expect((await rows()).map((r) => r.date)).toEqual(['2025-01-01', '2026-03-17', '2026-03-18', '2026-03-19']);
  });
});

describe('daily price job', () => {
  it('skips while running and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let finish;
    const slow = vi.fn(() => new Promise((resolve) => (finish = resolve)));

    const first = runDailyPriceJob(slow);
    expect(await runDailyPriceJob(slow)).toEqual({ status: 'skipped' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/still in progress/));
    finish({ status: 'up_to_date' });
    expect(await first).toEqual({ status: 'ok', result: { status: 'up_to_date' } });

    const failed = await runDailyPriceJob(async () => {
      throw new Error('boom');
    });
    expect(failed.status).toBe('failed');
    expect(error).toHaveBeenCalledWith('[daily-price-job] Rollup failed: boom');
  });

  it('is not scheduled in tests', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(startDailyPriceJob()).toBeNull();
  });
});
