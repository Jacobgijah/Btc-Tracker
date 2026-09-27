import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

// Compared against when the email doesn't exist, so response timing is the
// same for "unknown user" and "wrong password". Same cost as real hashes (12).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', 12);

const INVALID_CREDENTIALS = 'Invalid email or password';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    return res.status(401).json({ error: INVALID_CREDENTIALS });
  }

  res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
