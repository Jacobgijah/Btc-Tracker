// npm run prices:backfill -- [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force]
//
// Fills DailyPrice for every missing day from the first transaction (or --from)
// up to yesterday (or --to). Re-running only fills gaps; --force re-fetches every
// day in the range and overwrites it.

import { parseArgs } from 'node:util';
import { prisma } from '../lib/prisma.js';
import { isDay } from '../lib/days.js';
import { backfillDailyPrices, formatBackfillReport } from '../services/prices/dailyPrice.service.js';

const USAGE = 'Usage: npm run prices:backfill -- [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force]';

function parse() {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }
  for (const key of ['from', 'to']) {
    if (values[key] !== undefined && !isDay(values[key])) {
      throw new Error(`--${key} must be a date in YYYY-MM-DD format`);
    }
  }
  if (values.from && values.to && values.from > values.to) throw new Error('--from must not be after --to');
  return values;
}

async function main() {
  const { from, to, force } = parse();
  const started = Date.now();
  const report = await backfillDailyPrices({ from, to, force });
  console.log(`\n${formatBackfillReport(report)}`);
  console.log(`  Took:                ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main()
  .catch((err) => {
    console.error(`Backfill failed: ${err.message}`);
    if (err.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') console.error(USAGE);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
