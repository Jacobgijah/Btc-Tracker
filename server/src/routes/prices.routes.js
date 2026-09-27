import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { isoDate, endOfDayBound, pastDay } from '../schemas/common.js';
import { HttpError } from '../lib/errors.js';
import { formatRate } from '../lib/money.js';
import { getLatestPrice, refreshPrices, getPriceHistory } from '../services/prices/price.service.js';
import { resolveUsdTzsForDate } from '../services/prices/fxRate.service.js';

const router = Router();
router.use(requireAuth);

const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Prices can be refreshed at most once per minute' },
});

const historyQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: endOfDayBound.optional(),
    interval: z.enum(['raw', 'hourly', 'daily']).default('raw'),
  })
  .superRefine((q, ctx) => {
    if (q.from instanceof Date && q.to instanceof Date && q.from > q.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must be before to' });
    }
  });

const fxQuerySchema = z.object({ date: pastDay });

router.get('/latest', async (req, res) => {
  const latest = await getLatestPrice();
  if (!latest) throw new HttpError(404, 'No price snapshot yet. Try POST /prices/refresh.');
  res.json(latest);
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  res.json(await refreshPrices());
});

router.get('/history', async (req, res) => {
  res.json(await getPriceHistory(historyQuerySchema.parse(req.query)));
});

router.get('/fx', async (req, res) => {
  const { date } = fxQuerySchema.parse(req.query);
  const day = date.toISOString().slice(0, 10);
  const found = await resolveUsdTzsForDate(date);
  if (!found) {
    throw new HttpError(404, `No USD/TZS rate found for ${day}. Enter it manually.`, { date: day });
  }
  res.json({ date: day, usdTzs: formatRate(found.rate), source: found.source, asOf: found.asOf });
});

export default router;
