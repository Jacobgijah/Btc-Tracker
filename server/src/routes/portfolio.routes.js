import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPortfolioSummary, getLedger } from '../services/portfolio.service.js';

const router = Router();
router.use(requireAuth);

router.get('/summary', async (req, res) => {
  res.json(await getPortfolioSummary());
});

router.get('/ledger', async (req, res) => {
  res.json(await getLedger());
});

export default router;
