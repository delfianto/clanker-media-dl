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
  const text = activeJobs > 0 ? String(activeJobs) : "";
  browser.action.setBadgeText({ text }).catch(() => {});
  if (activeJobs > 0) {
    void browser.action.setBadgeBackgroundColor({ color: "#3b82f6" }).catch(() => {});
  }
}

// SW startup: no job is active yet (resumeRunningJobs marks any leftover running
// jobs as error), so force the native UI back on. This recovers the case where
// the SW died mid-crawl while the UI was suppressed and never got to restore it.
export function initDownloadUi(): void {
  activeJobs = 0;
  setNativeUi(true);
  updateBadge();
}

// A download job started running — suppress the native UI on the 0→1 edge.
export function jobActivityBegin(): void {
  activeJobs++;
  if (activeJobs === 1) setNativeUi(false);
  updateBadge();
}

// A download job reached a terminal state — restore the native UI on the 1→0
// edge. Safe to over-call; clamped at zero.
export function jobActivityEnd(): void {
  if (activeJobs > 0) activeJobs--;
  if (activeJobs === 0) setNativeUi(true);
  updateBadge();
}
