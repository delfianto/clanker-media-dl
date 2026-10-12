export type DownloadState = { state: string; error?: string };

// Subscribe before the initial read: the terminal event may have happened before
// downloads.download() returned its ID, or while the initial search is in flight.
// Polling covers dropped events without imposing a time limit on large videos.
export function waitForDownloadCompletion(
  read: () => Promise<DownloadState | undefined>,
  subscribe: (listener: (state: DownloadState) => void) => () => void,
  pollMs = 5_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};

    function finish(error?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      if (error) reject(error);
      else resolve();
    }

    function onState(state: DownloadState): void {
      if (state.state === "complete") finish();
      else if (state.state === "interrupted" || state.state === "canceled") {
        finish(new Error(`download interrupted${state.error ? `: ${state.error}` : ""}`));
      }
    }

    async function inspect(): Promise<void> {
      try {
        const state = await read();
        if (settled) return;
        if (!state)
          finish(new Error("Download disappeared from browser history before completion"));
        else onState(state);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
      if (!settled) timer = setTimeout(() => void inspect(), pollMs);
    }

    unsubscribe = subscribe(onState);
    // Accommodate a synchronous notification from the subscription itself.
    if (settled) unsubscribe();
    else void inspect();
  });
}
