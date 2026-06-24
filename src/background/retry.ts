// Retry helper for transient *network* failures (fetch/resolution stage).

export function isTransientFetchError(err: unknown): boolean {
  const msg = String(err);
  return /HTTP\s+5\d\d/.test(msg) || /Failed to fetch|NetworkError|abort/i.test(msg);
}

export type RetryOptions = {
  maxRetries?: number; // default 3
  baseDelayMs?: number; // default 1000; backoff = baseDelayMs * 2 ** (attempt - 1)
  onRetry?: (attempt: number, backoffMs: number) => void;
};

// Retry function with exponential backoff for transient errors.
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
