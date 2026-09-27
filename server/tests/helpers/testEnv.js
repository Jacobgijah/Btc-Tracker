// Loads .env.test (+ optional .env.test.local overrides) and refuses to
// continue unless DATABASE_URL points at a database whose name ends in "_test".
// This is the guard that keeps the test suite away from the dev database.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function assertTestDatabase(url) {
  let dbName;
  try {
    dbName = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error(`Test DATABASE_URL is missing or invalid: ${url}`);
  }
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${dbName}": the test database name must end in "_test".`,
    );
  }
  return dbName;
}

export function loadTestEnv() {
  const env = {};
  for (const file of ['.env.test', '.env.test.local']) {
    const full = path.join(serverDir, file);
    if (fs.existsSync(full)) Object.assign(env, dotenv.parse(fs.readFileSync(full)));
  }
  assertTestDatabase(env.DATABASE_URL);
  return env;
}
