// Integration setup file: no test may reach the real network. Every test starts
// with a fetch that fails loudly; tests that need responses install their own
// mock with routeFetch(). In-memory price caches are cleared between tests.

import { beforeEach, afterEach, vi } from 'vitest';
import { httpDefaults } from '../../src/lib/http.js';
import { resetPriceCaches } from '../../src/services/prices/price.service.js';
import { resetFxHistoryCache } from '../../src/services/prices/fxRate.service.js';

// Keep retries/timeouts fast in tests.
httpDefaults.backoffMs = 1;
httpDefaults.timeoutMs = 200;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      throw new Error(`Unexpected real network call in a test: ${url}`);
    }),
  );
  resetPriceCaches();
  resetFxHistoryCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
