import { beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { signToken } from '../../src/middleware/auth.js';
import { assertTestDatabase } from './testEnv.js';

export const TEST_EMAIL = 'tester@example.com';
export const TEST_PASSWORD = 'correct-horse-battery-staple';

/**
 * Registers hooks that wipe the test database and create a fresh user before
 * every test. Returns helpers for making (authenticated) requests.
 */
export function setupApi() {
  const state = { token: null, user: null };

  beforeAll(async () => {
    // Belt and braces: check the connection itself, not just the env var.
    assertTestDatabase(process.env.DATABASE_URL);
    const [{ db }] = await prisma.$queryRaw`SELECT current_database() AS db`;
    if (!db.endsWith('_test')) throw new Error(`Connected to "${db}", refusing to wipe it`);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Transaction", "PriceSnapshot", "Setting", "User" RESTART IDENTITY CASCADE',
    );
    // Low bcrypt cost keeps the suite fast; only this test user uses it.
    state.user = await prisma.user.create({
      data: { email: TEST_EMAIL, passwordHash: await bcrypt.hash(TEST_PASSWORD, 4) },
    });
    state.token = signToken(state.user);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const anon = () => request(app);
  const authed = (method, url) =>
    request(app)[method](url).set('Authorization', `Bearer ${state.token}`);

  return {
    state,
    prisma,
    anon,
    get: (url) => authed('get', url),
    post: (url, body) => authed('post', url).send(body),
    patch: (url, body) => authed('patch', url).send(body),
    del: (url) => authed('delete', url),
  };
}
