import { describe, it, expect } from "bun:test";
import { isTransientFetchError, withRetry } from "../src/background/retry";

describe("isTransientFetchError", () => {
  it("flags HTTP 5xx errors (incl. resolver-wrapped messages)", () => {
    expect(isTransientFetchError(new Error("HTTP 500"))).toBe(true);
    expect(isTransientFetchError(new Error("HTTP 503"))).toBe(true);
    expect(isTransientFetchError(new Error("Failed to POST to imx.to! HTTP 502"))).toBe(true);
    expect(isTransientFetchError(new Error("ImageVenue HTTP 504"))).toBe(true);
  });

  it("flags network / abort errors", () => {
    expect(isTransientFetchError(new Error("Failed to fetch"))).toBe(true);
    expect(
      isTransientFetchError(new TypeError("NetworkError when attempting to fetch resource")),
    ).toBe(true);
    expect(isTransientFetchError(new Error("The operation was aborted"))).toBe(true);
  });

  it("does not flag HTTP 4xx", () => {
    expect(isTransientFetchError(new Error("HTTP 404"))).toBe(false);
    expect(isTransientFetchError(new Error("HTTP 403"))).toBe(false);
    expect(isTransientFetchError(new Error("HTTP 400"))).toBe(false);
  });

  it("does not flag parse / logic errors", () => {
    expect(isTransientFetchError(new Error("Failed to parse direct image URL"))).toBe(false);
    expect(isTransientFetchError(new Error("no leaf resolver for host: example.com"))).toBe(false);
    expect(
      isTransientFetchError(new Error("Failed to extract image URL from ImageVenue page")),
    ).toBe(false);
  });

  it("handles non-Error inputs", () => {
    expect(isTransientFetchError("HTTP 503")).toBe(true);
    expect(isTransientFetchError(null)).toBe(false);
    expect(isTransientFetchError(undefined)).toBe(false);
    expect(isTransientFetchError(42)).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns immediately on first success", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return "ok";
      },
      { baseDelayMs: 0 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries transient failures, then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("HTTP 503");
        return "recovered";
      },
      { baseDelayMs: 0 },
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("does not retry non-transient failures", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("HTTP 404");
        },
        { baseDelayMs: 0 },
      ),
    ).rejects.toThrow("HTTP 404");
    expect(calls).toBe(1);
  });

  it("gives up after maxRetries, throwing the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("HTTP 500");
        },
        { baseDelayMs: 0, maxRetries: 2 },
      ),
    ).rejects.toThrow("HTTP 500");
    expect(calls).toBe(3); // initial attempt + 2 retries
  });

  it("defaults to 3 retries (4 total attempts)", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("HTTP 500");
        },
        { baseDelayMs: 0 },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(4);
  });

  it("reports attempt number and exponential backoff to onRetry", async () => {
    const events: { attempt: number; backoff: number }[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("HTTP 503");
        return "ok";
      },
      {
        baseDelayMs: 10,
        onRetry: (attempt, backoff) => events.push({ attempt, backoff }),
      },
    );
    expect(events).toEqual([
      { attempt: 1, backoff: 10 },
      { attempt: 2, backoff: 20 },
    ]);
  });
});
