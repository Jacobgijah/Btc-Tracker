import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/errors.js';
import { ensureDefaultSettings } from './settings.service.js';

const BCRYPT_COST = 12;

function serializeUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
  return users.map(serializeUser);
}

export async function createUser({ email, password, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, 'A user with this email already exists', { field: 'email' });
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await prisma.user.create({ data: { email, passwordHash, role } });
  await ensureDefaultSettings(user.id);
  return serializeUser(user);
}

/** Rejects a patch that would leave no active admin. */
async function assertNotLastAdmin(id, patch) {
  const target = await prisma.user.findUniqueOrThrow({ where: { id } });
  const losingAdmin = target.role === 'ADMIN' && (patch.role === 'USER' || patch.isActive === false);
  if (!losingAdmin) return;

  const otherActiveAdmins = await prisma.user.count({
    where: { role: 'ADMIN', isActive: true, id: { not: id } },
  });
  if (otherActiveAdmins === 0) {
    throw new HttpError(422, 'Cannot remove the last active admin');
  }
}

export async function updateUser(id, patch) {
  await assertNotLastAdmin(id, patch);
  const user = await prisma.user.update({ where: { id }, data: patch });
  return serializeUser(user);
}

export async function resetUserPassword(id, password) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
}
