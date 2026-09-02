import browser from "webextension-polyfill";

interface PendingDownload {
  resolve: () => void;
  reject: (err: Error) => void;
  jobId?: string;
  desiredFilename?: string;
}

const pendingDownloads = new Map<number, PendingDownload>();

interface FilenameRegistration {
  url: string;
  desiredFilename: string;
  cleanupTimer: ReturnType<typeof setTimeout>;
}

interface FilenameDownloadItem {
  id: number;
  url: string;
  byExtensionId?: string;
}

type FilenameSuggestion = (suggestion?: { filename: string; conflictAction: "uniquify" }) => void;

type FilenameListener = (item: FilenameDownloadItem, suggest: FilenameSuggestion) => void;

interface NativeDownloads {
  onDeterminingFilename: {
    addListener: (listener: FilenameListener) => void;
    removeListener: (listener: FilenameListener) => void;
  };
}

const nativeDownloads = (globalThis as unknown as { chrome: { downloads: NativeDownloads } }).chrome
  .downloads;
const filenameRegistrations = new Map<string, FilenameRegistration>();
let filenameListenerInstalled = false;

function removeFilenameRegistration(key: string): void {
  const registration = filenameRegistrations.get(key);
  if (!registration) return;

  clearTimeout(registration.cleanupTimer);
  filenameRegistrations.delete(key);
  if (filenameRegistrations.size === 0 && filenameListenerInstalled) {
    nativeDownloads.onDeterminingFilename.removeListener(determineFilename);
    filenameListenerInstalled = false;
  }
}

const determineFilename: FilenameListener = (item, suggest) => {
  // Merely keeping this event listener installed changes filename resolution
  // for every extension. Only install it while one of our own downloads is
  // entering Chrome's download manager, and never suggest for another
  // extension's download.
  if (item.byExtensionId !== browser.runtime.id) return;

  for (const [key, registration] of filenameRegistrations) {
    if (registration.url !== item.url) continue;

    suggest({ filename: registration.desiredFilename, conflictAction: "uniquify" });
    removeFilenameRegistration(key);
    return;
  }
};

export function preRegisterFilename(url: string, desiredFilename: string): string {
  const key = crypto.randomUUID();
  const cleanupTimer = setTimeout(() => removeFilenameRegistration(key), 30_000);
  filenameRegistrations.set(key, { url, desiredFilename, cleanupTimer });

  if (!filenameListenerInstalled) {
    nativeDownloads.onDeterminingFilename.addListener(determineFilename);
    filenameListenerInstalled = true;
  }
  return key;
}

export function unregisterFilename(key: string): void {
  removeFilenameRegistration(key);
}

browser.downloads.onChanged.addListener((delta) => {
  if (delta.state === undefined) return;
  const pending = pendingDownloads.get(delta.id);
  if (!pending) return;

  if (delta.state.current === "complete") {
    pendingDownloads.delete(delta.id);

    if (pending.desiredFilename) {
      browser.downloads
        .search({ id: delta.id })
        .then((results) => {
          const dl = results[0];
          if (dl && dl.filename) {
            const actualPath = dl.filename.replace(/\\/g, "/");
            const expectedSuffix = pending.desiredFilename!.replace(/\\/g, "/");
            if (!actualPath.endsWith(expectedSuffix)) {
              // Stray file detected! The browser saved it somewhere else (usually ~/Downloads).
              // Dynamic import to avoid circular dependencies if any exist.
              import("./logger")
                .then(({ appendLog }) => {
                  void appendLog(
                    "error",
                    `STRAY FILE DETECTED! Expected: .../${expectedSuffix} | Actual: ${actualPath} | Source URL: ${dl.url}`,
                    pending.jobId,
                  );
                })
                .catch(() => {});
            }
          }
        })
        .catch(() => {});
    }

    if (pending.jobId) {
      browser.downloads.erase({ id: delta.id }).catch(() => {});
    }

    pending.resolve();
  } else if (delta.state.current === "interrupted") {
    pendingDownloads.delete(delta.id);
    browser.downloads.erase({ id: delta.id }).catch(() => {});
    pending.reject(
      new Error(`download interrupted${delta.error ? `: ${delta.error.current}` : ""}`),
    );
  } else if (delta.state.current === "canceled") {
    pendingDownloads.delete(delta.id);
    browser.downloads.erase({ id: delta.id }).catch(() => {});
    pending.reject(new Error("download canceled"));
  }
});

export function trackDownload(
  downloadId: number,
  jobId: string,
  desiredFilename?: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    pendingDownloads.set(downloadId, {
      resolve,
      reject,
      jobId,
      ...(desiredFilename ? { desiredFilename } : {}),
    });
  });
}

export function cancelActiveDownloads(jobId: string): void {
  for (const [downloadId, pending] of pendingDownloads.entries()) {
    if (pending.jobId === jobId) {
      browser.downloads.cancel(downloadId).catch(() => {});
    }
  }
}
