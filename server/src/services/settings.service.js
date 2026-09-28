import { prisma } from '../lib/prisma.js';
import { DEFAULT_SETTINGS } from '../constants.js';

/** Returns { displayCurrency, costMethod }, falling back to defaults for missing keys. */
export async function getSettings(userId, db = prisma) {
  const rows = await db.setting.findMany({
    where: { userId, key: { in: Object.keys(DEFAULT_SETTINGS) } },
  });
  const settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) settings[key] = value;
  return settings;
}

export async function updateSettings(userId, changes) {
  await prisma.$transaction(
    Object.entries(changes).map(([key, value]) =>
      prisma.setting.upsert({
        where: { userId_key: { userId, key } },
        update: { value },
        create: { userId, key, value },
      }),
    ),
  );
  return getSettings(userId);
}

/** Upserts any DEFAULT_SETTINGS keys the user doesn't already have a value for. */
export async function ensureDefaultSettings(userId, db = prisma) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.setting.upsert({
      where: { userId_key: { userId, key } },
      update: {},
      create: { userId, key, value },
    });
  }
}
