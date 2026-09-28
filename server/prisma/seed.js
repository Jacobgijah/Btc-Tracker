import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_SETTINGS } from '../src/constants.js';
import { ensureDefaultSettings } from '../src/services/settings.service.js';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the bootstrap admin user.');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN' },
    create: { email, passwordHash, role: 'ADMIN' },
  });
  console.log(`Admin user ready: ${user.email} (id ${user.id})`);

  await ensureDefaultSettings(user.id, prisma);
  console.log(`Default settings ensured: ${Object.keys(DEFAULT_SETTINGS).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
