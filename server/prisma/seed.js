import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SETTINGS = {
  displayCurrency: 'TZS',
  costMethod: 'AVERAGE',
};

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the user.');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`User ready: ${user.email} (id ${user.id})`);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    // update: {} keeps any value already chosen.
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log(`Default settings ensured: ${Object.keys(DEFAULT_SETTINGS).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
