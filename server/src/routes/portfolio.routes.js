import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { CURRENCIES } from '../constants.js';
import {
  HISTORY_RANGES,
  getPortfolioSummary,
  getLedger,
  getHistory,
  getMonthly,
} from '../services/portfolio.service.js';

const router = Router();
router.use(requireAuth);

const historyQuerySchema = z.object({
  range: z.enum(Object.keys(HISTORY_RANGES)).default('ALL'),
  currency: z.enum(CURRENCIES).optional(),
});

const monthlyQuerySchema = z.object({
  currency: z.enum(CURRENCIES).optional(),
});

router.get('/summary', async (req, res) => {
  res.json(await getPortfolioSummary(req.user.id));
});

router.get('/ledger', async (req, res) => {
  res.json(await getLedger(req.user.id));
});

router.get('/history', async (req, res) => {
  res.json(await getHistory(req.user.id, historyQuerySchema.parse(req.query)));
});

router.get('/monthly', async (req, res) => {
  res.json(await getMonthly(req.user.id, monthlyQuerySchema.parse(req.query)));
});

export default router;
