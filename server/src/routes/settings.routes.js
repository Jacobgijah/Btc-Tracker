import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { CURRENCIES, COST_METHODS } from '../constants.js';
import { getSettings, updateSettings } from '../services/settings.service.js';

const router = Router();
router.use(requireAuth);

const patchSettingsSchema = z
  .object({
    displayCurrency: z.enum(CURRENCIES).optional(),
    costMethod: z.enum(COST_METHODS).optional(),
  })
  .strict()
  .refine((s) => Object.keys(s).length > 0, 'Provide at least one setting to update');

router.get('/', async (req, res) => {
  res.json(await getSettings());
});

router.patch('/', async (req, res) => {
  res.json(await updateSettings(patchSettingsSchema.parse(req.body)));
});

export default router;
