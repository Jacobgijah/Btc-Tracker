import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';

const ALGORITHM = 'HS256';

export function signToken(user) {
  return jwt.sign({ email: user.email }, config.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: String(user.id),
    expiresIn: config.JWT_EXPIRES_IN,
  });
}

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, { algorithms: [ALGORITHM] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const id = Number(payload.sub);
  if (!Number.isInteger(id)) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Confirm the user still exists so a deleted user's token stops working.
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}
