import { defineConfig } from 'vitest/config';
import { loadTestEnv } from './tests/helpers/testEnv.js';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.js'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          environment: 'node',
          // Loaded (and checked to point at a *_test database) before any app code runs.
          env: loadTestEnv(),
          globalSetup: ['tests/helpers/globalSetup.js'],
          // Blocks real network calls and resets in-memory price caches per test.
          setupFiles: ['tests/helpers/noNetwork.js'],
          // All files share one database, so never run them concurrently.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
