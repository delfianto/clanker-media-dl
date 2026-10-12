export type OffscreenOperations = {
  exists: () => Promise<boolean>;
  create: () => Promise<void>;
  close: () => Promise<void>;
};

// Chrome reports a document as existing before createDocument() finishes. All
// existence checks, creates, and closes must share one queue, otherwise a close
// can destroy a still-loading document and reject createDocument().
export function createOffscreenLifecycle(operations: OffscreenOperations) {
  let queue = Promise.resolve();

  function enqueue(operation: () => Promise<void>): Promise<void> {
    const result = queue.then(operation);
    // A failed operation must not poison later create/close requests. Return
    // the original promise so callers still receive and handle the failure.
    queue = result.catch(() => {});
    return result;
  }

  return {
    ensure: () =>
      enqueue(async () => {
        if (!(await operations.exists())) await operations.create();
      }),
    close: (shouldClose: () => boolean = () => true) =>
      enqueue(async () => {
        // Evaluate demand when the queued operation runs, and again after the
        // async check: another job may have started while this close was waiting.
        if (!shouldClose()) return;
        if ((await operations.exists()) && shouldClose()) await operations.close();
      }),
  };
}
