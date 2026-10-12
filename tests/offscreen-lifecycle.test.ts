import { describe, expect, it } from "bun:test";
import { createOffscreenLifecycle } from "../src/background/offscreen-lifecycle";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("offscreen lifecycle", () => {
  it("shares one document among concurrent creation requests", async () => {
    let exists = false;
    let creates = 0;
    const lifecycle = createOffscreenLifecycle({
      exists: async () => exists,
      create: async () => {
        creates++;
        exists = true;
      },
      close: async () => {
        exists = false;
      },
    });
    await Promise.all(Array.from({ length: 20 }, () => lifecycle.ensure()));
    expect(creates).toBe(1);
  });

  it("never closes a document before createDocument finishes loading", async () => {
    const started = deferred();
    const loaded = deferred();
    let exists = false;
    let loading = false;
    let closes = 0;
    const lifecycle = createOffscreenLifecycle({
      exists: async () => exists,
      create: async () => {
        exists = true;
        loading = true;
        started.resolve();
        await loaded.promise;
        loading = false;
      },
      close: async () => {
        if (loading) throw new Error("Offscreen document closed before fully loading.");
        closes++;
        exists = false;
      },
    });
    const ensure = lifecycle.ensure();
    await started.promise;
    const close = lifecycle.close();
    await Promise.resolve();
    expect(closes).toBe(0);
    loaded.resolve();
    await Promise.all([ensure, close]);
    expect(closes).toBe(1);
    expect(exists).toBe(false);
  });

  it("skips stale idle cleanup when another job starts while creation is pending", async () => {
    const started = deferred();
    const loaded = deferred();
    let activeJobs = 0;
    let exists = false;
    let closes = 0;
    const lifecycle = createOffscreenLifecycle({
      exists: async () => exists,
      create: async () => {
        exists = true;
        started.resolve();
        await loaded.promise;
      },
      close: async () => {
        closes++;
        exists = false;
      },
    });
    const ensure = lifecycle.ensure();
    await started.promise;
    const close = lifecycle.close(() => activeJobs === 0);
    activeJobs++;
    const nextEnsure = lifecycle.ensure();
    loaded.resolve();
    await Promise.all([ensure, close, nextEnsure]);
    expect(closes).toBe(0);
    expect(exists).toBe(true);
  });

  it("waits for an in-flight close before recreating the document", async () => {
    const started = deferred();
    const closed = deferred();
    let exists = true;
    let closing = false;
    let creates = 0;
    const lifecycle = createOffscreenLifecycle({
      exists: async () => exists,
      close: async () => {
        closing = true;
        started.resolve();
        await closed.promise;
        exists = false;
        closing = false;
      },
      create: async () => {
        expect(closing).toBe(false);
        creates++;
        exists = true;
      },
    });
    const close = lifecycle.close();
    await started.promise;
    const ensure = lifecycle.ensure();
    closed.resolve();
    await Promise.all([close, ensure]);
    expect(creates).toBe(1);
    expect(exists).toBe(true);
  });

  it("rechecks active jobs after the async existence query", async () => {
    const checked = deferred();
    const result = deferred();
    let active = false;
    let closes = 0;
    const lifecycle = createOffscreenLifecycle({
      exists: async () => {
        checked.resolve();
        await result.promise;
        return true;
      },
      create: async () => {},
      close: async () => {
        closes++;
      },
    });
    const close = lifecycle.close(() => !active);
    await checked.promise;
    active = true;
    result.resolve();
    await close;
    expect(closes).toBe(0);
  });

  it("recovers after creation or close failure instead of poisoning future jobs", async () => {
    let exists = false;
    let creates = 0;
    let closes = 0;
    const lifecycle = createOffscreenLifecycle({
      exists: async () => exists,
      create: async () => {
        if (++creates === 1) throw new Error("create failed");
        exists = true;
      },
      close: async () => {
        if (++closes === 1) throw new Error("close failed");
        exists = false;
      },
    });
    await expect(lifecycle.ensure()).rejects.toThrow("create failed");
    await lifecycle.ensure();
    await expect(lifecycle.close()).rejects.toThrow("close failed");
    await lifecycle.close();
    await lifecycle.ensure();
    expect(exists).toBe(true);
    expect(creates).toBe(3);
  });

  it("handles 50 rapid start/stop cycles without overlapping create and close", async () => {
    let exists = false;
    let busy = false;
    let creates = 0;
    let closes = 0;
    const lifecycle = createOffscreenLifecycle({
      exists: async () => exists,
      create: async () => {
        expect(busy).toBe(false);
        busy = true;
        exists = true;
        await Promise.resolve();
        creates++;
        busy = false;
      },
      close: async () => {
        expect(busy).toBe(false);
        busy = true;
        await Promise.resolve();
        exists = false;
        closes++;
        busy = false;
      },
    });
    const requests = [];
    for (let i = 0; i < 50; i++) requests.push(lifecycle.ensure(), lifecycle.close());
    await Promise.all(requests);
    expect(creates).toBe(50);
    expect(closes).toBe(50);
    expect(exists).toBe(false);
  });
});
