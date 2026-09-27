import cron from 'node-cron';
import { config } from '../config.js';
import { refreshPrices } from '../services/prices/price.service.js';

let running = false;

/**
 * One refresh. Skips if the previous run hasn't finished, and never throws:
 * every failure is logged and reported in the return value.
 */
export async function runPriceJob(refresh = refreshPrices) {
  if (running) {
    console.warn('[price-job] Previous run still in progress; skipping this one');
    return { status: 'skipped' };
  }
  running = true;
  try {
    return { status: 'ok', snapshot: await refresh() };
  } catch (err) {
    console.error(`[price-job] Refresh failed: ${err.message}`);
    return { status: 'failed', error: err };
  } finally {
    running = false;
  }
}

/**
 * Schedules the refresh job (and runs it once now) when ENABLE_PRICE_JOB is on.
 * Returns { stop } or null when disabled.
 */
export function startPriceJob() {
  if (!config.ENABLE_PRICE_JOB) {
    console.log('[price-job] Disabled (ENABLE_PRICE_JOB=false)');
    return null;
  }

  const task = cron.schedule(config.PRICE_REFRESH_CRON, () => runPriceJob(), { name: 'price-refresh' });
  console.log(`[price-job] Scheduled with "${config.PRICE_REFRESH_CRON}"; running once now`);
  runPriceJob();

  return {
    stop: async () => {
      await task.stop();
      console.log('[price-job] Stopped');
    },
  };
}
