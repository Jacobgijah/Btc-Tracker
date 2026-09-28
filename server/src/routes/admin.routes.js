import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '../schemas/admin.schema.js';
import { idParamSchema } from '../schemas/transaction.schema.js';
import { listUsers, createUser, updateUser, resetUserPassword } from '../services/admin.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res) => {
  res.json(await listUsers());
});

router.post('/users', async (req, res) => {
  const data = createUserSchema.parse(req.body);
  res.status(201).json(await createUser(data));
});

router.patch('/users/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const patch = updateUserSchema.parse(req.body);
  res.json(await updateUser(id, patch));
});

router.post('/users/:id/reset-password', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { password } = resetPasswordSchema.parse(req.body);
  await resetUserPassword(id, password);
  res.status(204).end();
});

export default router;
