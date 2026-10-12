import { describe, expect, it } from "bun:test";
import {
  waitForDownloadCompletion,
  type DownloadState,
} from "../src/background/download-completion";

function events() {
  const listeners = new Set<(state: DownloadState) => void>();
  return {
    listeners,
    subscribe(listener: (state: DownloadState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(state: DownloadState) {
      for (const listener of listeners) listener(state);
    },
  };
}

describe("native download completion", () => {
  it("settles when the file finished before tracking began", async () => {
    const stream = events();
    await waitForDownloadCompletion(async () => ({ state: "complete" }), stream.subscribe);
    expect(stream.listeners.size).toBe(0);
  });

  it("rejects an interruption that happened before tracking began", async () => {
    const stream = events();
    await expect(
      waitForDownloadCompletion(
        async () => ({ state: "interrupted", error: "NETWORK_FAILED" }),
        stream.subscribe,
      ),
    ).rejects.toThrow("NETWORK_FAILED");
    expect(stream.listeners.size).toBe(0);
  });

  it("polls to recover a missing completion event", async () => {
    const stream = events();
    let reads = 0;
    await waitForDownloadCompletion(
      async () => ({ state: ++reads === 3 ? "complete" : "in_progress" }),
      stream.subscribe,
      1,
    );
    expect(reads).toBe(3);
    expect(stream.listeners.size).toBe(0);
  });

  it("does not rearm polling when an event wins an in-flight read", async () => {
    const stream = events();
    let resolveRead!: (state: DownloadState) => void;
    let reads = 0;
    const done = waitForDownloadCompletion(
      () => {
        reads++;
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
      stream.subscribe,
      1,
    );
    stream.emit({ state: "complete" });
    resolveRead({ state: "in_progress" });
    await done;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reads).toBe(1);
    expect(stream.listeners.size).toBe(0);
  });

  it("handles synchronous subscription notification without leaking the listener", async () => {
    let detached = false;
    await waitForDownloadCompletion(
      async () => {
        throw new Error("must not read");
      },
      (listener) => {
        listener({ state: "complete" });
        return () => {
          detached = true;
        };
      },
    );
    expect(detached).toBe(true);
  });

  it("rejects missing history and read failures instead of hanging the queue", async () => {
    const stream = events();
    await expect(
      waitForDownloadCompletion(async () => undefined, stream.subscribe),
    ).rejects.toThrow("disappeared");
    await expect(
      waitForDownloadCompletion(async () => {
        throw new Error("API unavailable");
      }, stream.subscribe),
    ).rejects.toThrow("API unavailable");
    expect(stream.listeners.size).toBe(0);
  });

  it("processes 200 fast downloads without keeping completed listeners", async () => {
    const stream = events();
    for (let i = 0; i < 200; i++) {
      await waitForDownloadCompletion(async () => ({ state: "complete" }), stream.subscribe);
    }
    expect(stream.listeners.size).toBe(0);
  });

  it("waits for an active download and propagates cancellation", async () => {
    const stream = events();
    const done = waitForDownloadCompletion(
      async () => ({ state: "in_progress" }),
      stream.subscribe,
    );
    expect(stream.listeners.size).toBe(1);
    stream.emit({ state: "interrupted", error: "USER_CANCELED" });
    await expect(done).rejects.toThrow("USER_CANCELED");
    expect(stream.listeners.size).toBe(0);
  });
});
