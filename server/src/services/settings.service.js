import { prisma } from '../lib/prisma.js';
import { DEFAULT_SETTINGS } from '../constants.js';

/** Returns { displayCurrency, costMethod }, falling back to defaults for missing keys. */
export async function getSettings(db = prisma) {
  const rows = await db.setting.findMany({ where: { key: { in: Object.keys(DEFAULT_SETTINGS) } } });
  const settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) settings[key] = value;
  return settings;
}

export async function updateSettings(changes) {
  await prisma.$transaction(
    Object.entries(changes).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
  return getSettings();
}
