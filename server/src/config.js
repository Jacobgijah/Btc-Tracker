import 'dotenv/config';
import cron from 'node-cron';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'], { errorMap: () => ({ message: 'must be "true" or "false"' }) })
  .transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().min(1).default('7d'),
    PORT: z.coerce.number().int().positive().default(4000),
    CLIENT_ORIGIN: z.string().url('CLIENT_ORIGIN must be a valid URL'),

    // Prices
    COINGECKO_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined),
    PRICE_REFRESH_CRON: z
      .string()
      .trim()
      .default('*/15 * * * *')
      .refine((v) => cron.validate(v), 'PRICE_REFRESH_CRON must be a valid cron expression'),
    FX_CACHE_HOURS: z.coerce.number().positive('FX_CACHE_HOURS must be > 0').default(6),
    PRICE_STALE_MINUTES: z.coerce
      .number()
      .int()
      .positive('PRICE_STALE_MINUTES must be > 0')
      .default(60),
    ENABLE_PRICE_JOB: booleanString.optional(),
  })
  .transform((env) => ({
    ...env,
    // On by default, except in tests.
    ENABLE_PRICE_JOB: env.ENABLE_PRICE_JOB ?? env.NODE_ENV !== 'test',
  }))
  .refine((env) => !(env.NODE_ENV === 'test' && env.ENABLE_PRICE_JOB), {
    path: ['ENABLE_PRICE_JOB'],
    message: 'ENABLE_PRICE_JOB must be false when NODE_ENV=test',
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

export const config = Object.freeze(parsed.data);
