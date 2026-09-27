// Small JSON-over-HTTP helper for the price providers: native fetch, a
// per-attempt timeout, retries with exponential backoff, and a clear User-Agent.

export const USER_AGENT = 'btc-tracker/0.1 (personal Bitcoin savings tracker; Node.js fetch)';

// Mutable so tests can shorten the waits.
export const httpDefaults = {
  timeoutMs: 10_000,
  retries: 2,
  backoffMs: 500,
};

export class HttpRequestError extends Error {
  constructor(message, { status = null, retryable = true } = {}) {
    super(message);
    this.name = 'HttpRequestError';
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attempt(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
      signal: controller.signal,
    });
  } catch (err) {
    const message = controller.signal.aborted
      ? `timed out after ${timeoutMs}ms`
      : `network error: ${err.cause?.message ?? err.message}`;
    throw new HttpRequestError(message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Retry rate limits and server errors; other 4xx won't get better.
    const retryable = res.status === 429 || res.status >= 500;
    throw new HttpRequestError(`HTTP ${res.status}`, { status: res.status, retryable });
  }
  try {
    return await res.json();
  } catch {
    throw new HttpRequestError('response was not valid JSON', { retryable: false });
  }
}

/** GETs a URL and returns the parsed JSON body, or throws HttpRequestError. */
export async function fetchJson(url, { headers = {}, ...options } = {}) {
  const { timeoutMs, retries, backoffMs } = { ...httpDefaults, ...options };
  for (let i = 0; ; i++) {
    try {
      return await attempt(url, headers, timeoutMs);
    } catch (err) {
      if (!err.retryable || i >= retries) {
        if (i > 0) err.message += ` (after ${i + 1} attempts)`;
        throw err;
      }
      await sleep(backoffMs * 2 ** i);
    }
  }
}
