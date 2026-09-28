import cron from 'node-cron';
import { config } from '../config.js';
import { rollupDailyPrices } from '../services/prices/dailyPrice.service.js';

let running = false;

/**
 * One rollup. Skips if the previous run hasn't finished, and never throws:
 * every failure is logged and reported in the return value.
 */
export async function runDailyPriceJob(rollup = rollupDailyPrices) {
  if (running) {
    console.warn('[daily-price-job] Previous run still in progress; skipping this one');
    return { status: 'skipped' };
  }
  running = true;
  try {
    return { status: 'ok', result: await rollup() };
  } catch (err) {
    console.error(`[daily-price-job] Rollup failed: ${err.message}`);
    return { status: 'failed', error: err };
  } finally {
    running = false;
  }
}

/**
 * Schedules the nightly rollup in APP_TIMEZONE (and runs it once now, to catch up
 * on nights the server was off) when ENABLE_PRICE_JOB is on. Returns { stop } or null.
 */
export function startDailyPriceJob() {
  if (!config.ENABLE_PRICE_JOB) {
    console.log('[daily-price-job] Disabled (ENABLE_PRICE_JOB=false)');
    return null;
  }

  const task = cron.schedule(config.DAILY_PRICE_CRON, () => runDailyPriceJob(), {
    name: 'daily-price-rollup',
    timezone: config.APP_TIMEZONE,
  });
  console.log(
    `[daily-price-job] Scheduled with "${config.DAILY_PRICE_CRON}" (${config.APP_TIMEZONE}); catching up once now`,
  );
  runDailyPriceJob();

  return {
    stop: async () => {
      await task.stop();
      console.log('[daily-price-job] Stopped');
    },
  };
}
