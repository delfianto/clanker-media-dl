// Retry helper for transient *network* failures — HTTP 5xx, fetch/network
// errors, aborts. Used by the gallery viewer-page GET (fetchWithRetry) and the
// resolveFromViewer hook path, so hoster-specific resolution (imx.to POST,
// imagevenue interstitial) survives transient blips under load instead of
// failing the item on the first hiccup.
//
// NOTE: distinct from media-util's isTransientError, which classifies
// browser.downloads interruption codes (SERVER_FAILED, NETWORK_TIMEOUT, …) at
// the download stage. This one classifies fetch-side errors during resolution.

export function isTransientFetchError(err: unknown): boolean {
  const msg = String(err);
  return /HTTP\s+5\d\d/.test(msg) || /Failed to fetch|NetworkError|abort/i.test(msg);
}

export type RetryOptions = {
  maxRetries?: number; // default 3
  baseDelayMs?: number; // default 1000; backoff = baseDelayMs * 2 ** (attempt - 1)
  onRetry?: (attempt: number, backoffMs: number) => void;
};

// Run `fn`, retrying with exponential backoff while it throws a transient fetch
// error. Non-transient errors (parse failures, HTTP 4xx) reject immediately.
// Rejects with the last error once retries are exhausted.
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      opts.onRetry?.(attempt, backoff);
      await new Promise((r) => setTimeout(r, backoff));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isTransientFetchError(err)) continue;
      break;
    }
  }
  throw lastErr;
}
