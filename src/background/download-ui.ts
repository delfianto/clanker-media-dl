import browser from "webextension-polyfill";

// Chrome re-renders its download shelf/bubble on the BROWSER UI thread for every
// downloads.download() call. A crawl fires thousands of them, so the whole
// browser janks. We suppress the native download UI — but only while download
// jobs are actually running (ref-counted) and restore it when idle, so ordinary
// manual downloads keep their shelf. While jobs run we surface progress on the
// toolbar icon instead (badge = number of active download jobs).
//
// setUiOptions is Chrome-only and gated behind the "downloads.ui" permission;
// browser.action badges work on both. Both are feature-detected so Firefox just
// no-ops the parts it lacks.

import { ensureOffscreenDocument, closeOffscreenDocument } from "./offscreen";

const dl = browser.downloads as unknown as {
  setUiOptions?: (opts: { enabled: boolean }) => Promise<void>;
};

let activeJobs = 0;

function setNativeUi(enabled: boolean): void {
  if (typeof dl.setUiOptions !== "function") return;
  dl.setUiOptions({ enabled }).catch((err: unknown) => {
    console.warn(`[md] downloads.setUiOptions(${enabled}) failed:`, err);
  });
}

function updateBadge(): void {
  const action = browser.action as unknown as {
    setBadgeTextColor?: (details: { color: string }) => Promise<void>;
  };
  if (activeJobs > 0) {
    void browser.action.setBadgeText({ text: "●" }).catch(() => {});
    void action.setBadgeTextColor?.({ color: "#22c55e" }).catch(() => {});
    void browser.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] }).catch(() => {});
  } else {
    void browser.action.setBadgeText({ text: "" }).catch(() => {});
  }
}

export function initDownloadUi(): void {
  activeJobs = 0;
  void closeOffscreenDocument();
  setNativeUi(true);
  updateBadge();
}

export function jobActivityBegin(): void {
  activeJobs++;
  if (activeJobs === 1) {
    setNativeUi(false);
    // Create the offscreen document to serve as a keep-alive anchor.
    // The offscreen document will ping the SW periodically to reset
    // the idle timer.
    void ensureOffscreenDocument();
  }
  updateBadge();
}

export function jobActivityEnd(): void {
  if (activeJobs > 0) activeJobs--;
  if (activeJobs === 0) {
    setNativeUi(true);
    void closeOffscreenDocument();
  }
  updateBadge();
}
