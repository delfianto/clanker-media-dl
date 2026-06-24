import browser from "webextension-polyfill";
import type { Settings } from "../types/global";
import type { HosterModel } from "../types/hoster";
import type { DownloadJob } from "../types/jobs";
import type { MDListJobsResponse, MDJobProgressMessage } from "../types/messages";
import { ALL_MODELS } from "../hosts/index";
import { DEFAULT_SETTINGS } from "../settings/schema";

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchModel(url: string): HosterModel | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  return ALL_MODELS.find((model) => {
    const isViewer = model.viewerMatches.some((p) => patternToRegex(p).test(url));
    const isGallery =
      model.galleryConfig?.galleryMatches.some((p) => patternToRegex(p).test(url)) ?? false;

    if (!isViewer && !isGallery) return false;

    // If it matched as a viewer, check the pathGuard
    if (isViewer && !isGallery) {
      const guard = model.downloadConfig.pathGuard;
      if (guard && !new RegExp(guard).test(pathname)) {
        return false;
      }
    }

    return true;
  });
}

// ── Active downloads list ────────────────────────────────────────────────────
// The popup is the toolbar-icon surface that replaces Chrome's suppressed
// native download shelf during crawls. It lists running jobs and updates them
// live from the SW's MD_JOB_PROGRESS stream.

const rows = new Map<string, HTMLElement>();

function jobLabel(job: DownloadJob | MDJobProgressMessage): string {
  const j = job as Partial<DownloadJob>;
  return j.subfolder || j.hosterId || "download";
}

function makeRow(job: DownloadJob): HTMLElement {
  const title = document.createElement("span");
  title.className = "dl-title";
  title.textContent = job.isCrawl ? `⏳ ${jobLabel(job)}` : jobLabel(job);

  const count = document.createElement("span");
  count.className = "dl-count";
  count.textContent = `${job.completedCount}/${job.totalCount}`;

  const bar = document.createElement("progress");
  bar.className = "dl-bar";
  bar.value = job.completedCount;
  bar.max = Math.max(job.totalCount, 1);

  const row = document.createElement("div");
  row.className = "dl-row";
  row.id = `dl-${job.jobId}`;
  const head = document.createElement("div");
  head.className = "dl-row-head";
  head.append(title, count);
  row.append(head, bar);
  return row;
}

function refreshDownloadsVisibility(): void {
  $("dl-count").textContent = String(rows.size);
  const section = $("downloads-section");
  if (rows.size > 0) section.removeAttribute("hidden");
  else section.setAttribute("hidden", "");
}

async function loadDownloads(): Promise<void> {
  const list = $("dl-list");
  try {
    const res = (await browser.runtime.sendMessage({ type: "MD_LIST_JOBS" })) as MDListJobsResponse;
    const running = res.jobs
      .filter((j) => j.status === "running")
      .sort((a, b) => b.startedAt - a.startedAt);
    list.replaceChildren();
    rows.clear();
    for (const job of running) {
      const row = makeRow(job);
      rows.set(job.jobId, row);
      list.append(row);
    }
  } catch {
    // SW unreachable — leave the section hidden.
  }
  refreshDownloadsVisibility();
}

function onProgress(msg: MDJobProgressMessage): void {
  const terminal = msg.status !== "running";
  const existing = rows.get(msg.jobId);

  if (terminal) {
    if (existing) {
      existing.remove();
      rows.delete(msg.jobId);
      refreshDownloadsVisibility();
    }
    return;
  }

  if (!existing) {
    // A job that started after the popup opened — render it.
    const row = makeRow({
      jobId: msg.jobId,
      hosterId: "" as DownloadJob["hosterId"],
      subfolder: "",
      totalCount: msg.totalCount,
      completedCount: msg.completedCount,
      failedCount: msg.failedCount ?? 0,
      status: "running",
      startedAt: Date.now(),
      items: [],
    });
    rows.set(msg.jobId, row);
    $("dl-list").append(row);
    refreshDownloadsVisibility();
    return;
  }

  const count = existing.querySelector<HTMLElement>(".dl-count");
  if (count) count.textContent = `${msg.completedCount}/${msg.totalCount}`;
  const bar = existing.querySelector("progress");
  if (bar) {
    bar.value = msg.completedCount;
    bar.max = Math.max(msg.totalCount, 1);
  }
}

async function init(): Promise<void> {
  let settings: Settings;
  try {
    settings = (await browser.storage.local.get(DEFAULT_SETTINGS)) as Settings;
    settings.hosters = { ...DEFAULT_SETTINGS.hosters, ...settings.hosters };
  } catch {
    settings = DEFAULT_SETTINGS;
  }

  $<HTMLSpanElement>("version").textContent = `v${browser.runtime.getManifest().version}`;

  const enabled = $<HTMLInputElement>("enabled");
  enabled.checked = settings.enabled;
  enabled.addEventListener("change", () => {
    void browser.storage.local.set({ enabled: enabled.checked });
  });

  // Active-page detection. tabs.query returns tab.url for pages that match our
  // host_permissions even without the "tabs" permission — exactly the hoster
  // pages we care about; everything else comes back without a url.
  const dot = $("active-dot");
  const text = $("active-text");
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const model = tab?.url ? matchModel(tab.url) : undefined;
    if (!model) {
      dot.className = "dot";
      text.textContent = "None";
    } else if (settings.enabled && settings.hosters[model.id].enabled) {
      dot.className = "dot on";
      text.textContent = model.displayName;
    } else {
      dot.className = "dot";
      text.textContent = model.displayName;
    }
  } catch {
    dot.className = "dot";
    text.textContent = "Unavailable";
  }

  $("open-options").addEventListener("click", () => {
    void browser.runtime.openOptionsPage();
    window.close();
  });

  // Live download list. Load current running jobs, then track the SW's progress
  // stream while the popup stays open.
  void loadDownloads();
  browser.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as Record<string, unknown>;
    if (m["type"] === "MD_JOB_PROGRESS") {
      onProgress(m as unknown as MDJobProgressMessage);
    }
  });
}

void init();
