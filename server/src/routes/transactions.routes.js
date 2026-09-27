import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createTransactionSchema,
  patchTransactionSchema,
  idParamSchema,
  listQuerySchema,
} from '../schemas/transaction.schema.js';
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../services/transactions.service.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await listTransactions(listQuerySchema.parse(req.query)));
});

router.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getTransaction(id));
});

router.post('/', async (req, res) => {
  const data = createTransactionSchema.parse(req.body);
  res.status(201).json(await createTransaction(data));
});

router.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const patch = patchTransactionSchema.parse(req.body);
  res.json(await updateTransaction(id, patch));
});

router.delete('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteTransaction(id);
  res.status(204).end();
});

export default router;
