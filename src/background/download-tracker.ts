import browser from "webextension-polyfill";
import { waitForDownloadCompletion } from "./download-completion";

interface PendingDownload {
  jobId: string;
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

export async function trackDownload(
  downloadId: number,
  jobId: string,
  desiredFilename?: string,
): Promise<void> {
  pendingDownloads.set(downloadId, { jobId });
  try {
    await waitForDownloadCompletion(
      async () => (await browser.downloads.search({ id: downloadId }))[0],
      (onState) => {
        const listener = (delta: browser.Downloads.OnChangedDownloadDeltaType): void => {
          if (delta.id !== downloadId || !delta.state?.current) return;
          onState({
            state: delta.state.current,
            ...(delta.error?.current ? { error: delta.error.current } : {}),
          });
        };
        browser.downloads.onChanged.addListener(listener);
        return () => browser.downloads.onChanged.removeListener(listener);
      },
    );

    // Inspect the filename before erasing history; otherwise the audit races
    // with erase() and often sees no item at all.
    if (desiredFilename) {
      const dl = (await browser.downloads.search({ id: downloadId }).catch(() => []))[0];
      if (dl?.filename) {
        const actualPath = dl.filename.replace(/\\/g, "/");
        const expectedSuffix = desiredFilename.replace(/\\/g, "/");
        if (!actualPath.endsWith(expectedSuffix)) {
          const { appendLog } = await import("./logger");
          void appendLog(
            "error",
            `STRAY FILE DETECTED! Expected: .../${expectedSuffix} | Actual: ${actualPath} | Source URL: ${dl.url}`,
            jobId,
          );
        }
      }
    }
  } catch (error) {
    await browser.downloads.erase({ id: downloadId }).catch(() => {});
    throw error;
  } finally {
    pendingDownloads.delete(downloadId);
    if (jobId) await browser.downloads.erase({ id: downloadId }).catch(() => {});
  }
}

export function cancelActiveDownloads(jobId: string): void {
  for (const [downloadId, pending] of pendingDownloads.entries()) {
    if (pending.jobId === jobId) {
      browser.downloads.cancel(downloadId).catch(() => {});
    }
  }
}
