import { describe, it, expect } from "bun:test";
import { mapWithConcurrency } from "../src/content/shared/collector";

describe("mapWithConcurrency", () => {
  it("runs at most `concurrency` items at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const concurrency = 4;

    await mapWithConcurrency(items, concurrency, new AbortController().signal, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });

    expect(peak).toBeLessThanOrEqual(concurrency);
    expect(peak).toBe(concurrency);
  });

  it("collects every successful result", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const results = await mapWithConcurrency(
      items,
      3,
      new AbortController().signal,
      async (n) => n * 10,
    );
    expect(results.sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("stops scheduling new work once the signal aborts", async () => {
    const controller = new AbortController();
    let started = 0;
    const items = Array.from({ length: 50 }, (_, i) => i);

    // Abort after the 3rd item starts.
    const results = await mapWithConcurrency(items, 2, controller.signal, async (n) => {
      started++;
      if (started === 3) controller.abort();
      // simulate latency so the abort propagates before the pool drains
      await new Promise((r) => setTimeout(r, 5));
      return n;
    });

    // A handful may have been in flight when abort fired, but the pool must not
    // have churned through all 50 — it stops scheduling once aborted.
    expect(started).toBeLessThan(items.length);
    expect(results.length).toBeLessThanOrEqual(started);
  });

  it("drops items whose fn throws (non-abort) without halting the pool", async () => {
    const items = Array.from({ length: 6 }, (_, i) => i);
    const results = await mapWithConcurrency(items, 2, new AbortController().signal, async (n) => {
      if (n % 2 === 0) throw new Error("boom");
      return n;
    });
    expect(results.sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  it("handles an empty input without invoking fn", async () => {
    let called = false;
    const results = await mapWithConcurrency([], 4, new AbortController().signal, async () => {
      called = true;
      return 1;
    });
    expect(results).toEqual([]);
    expect(called).toBe(false);
  });
});
