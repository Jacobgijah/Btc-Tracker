import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTestEnv, assertTestDatabase } from './testEnv.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default function setup() {
  const testEnv = loadTestEnv();
  const dbName = assertTestDatabase(testEnv.DATABASE_URL);

  // Applies pending migrations without dropping anything (creates the database
  // if needed). Tests truncate their tables in beforeEach, so no reset is needed.
  // Test values win over anything in the shell or .env.
  execSync('npx prisma migrate deploy', {
    cwd: serverDir,
    env: { ...process.env, ...testEnv },
    stdio: 'pipe',
  });
  console.log(`[globalSetup] migrations applied to test database "${dbName}"`);
}
