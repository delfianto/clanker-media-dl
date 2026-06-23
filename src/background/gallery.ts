import browser from "webextension-polyfill";
import type {
  GalleryJobItem,
  MDGalleryStartRequest,
  MDJobProgressMessage,
} from "../types/messages";
import type { DownloadJob } from "../types/jobs";
import { crossOriginFetchText } from "./fetcher";
import { appendLog } from "./logger";

const JOBS_KEY = "downloadJobs";

// ── Download completion tracking ─────────────────────────────────────────────
// browser.downloads.download() resolves on *initiation*, not completion.
// We track each downloadId and wait for onChanged to confirm the file actually
// landed on disk — otherwise CDN errors / expired tokens silently drop files
// while the job counter reports them as "ok".
//
// No fixed timeout: a 2 GB video on a slow link can legitimately take many
// minutes. Chrome's download manager reports interrupted/canceled on its own
// for network failures, expired tokens, disk-full, etc. — those are the real
// error signals, not an arbitrary timer.

interface PendingDownload {
  resolve: () => void;
  reject: (err: Error) => void;
}

const pendingDownloads = new Map<number, PendingDownload>();

browser.downloads.onChanged.addListener((delta) => {
  if (delta.state === undefined) return;
  const pending = pendingDownloads.get(delta.id);
  if (!pending) return;

  if (delta.state.current === "complete") {
    pendingDownloads.delete(delta.id);
    pending.resolve();
  } else if (delta.state.current === "interrupted") {
    pendingDownloads.delete(delta.id);
    pending.reject(
      new Error(`download interrupted${delta.error ? `: ${delta.error.current}` : ""}`),
    );
  } else if (delta.state.current === "canceled") {
    pendingDownloads.delete(delta.id);
    pending.reject(new Error("download canceled"));
  }
});

// ── Storage helpers ──────────────────────────────────────────────────────────

async function readJobs(): Promise<DownloadJob[]> {
  const stored = await browser.storage.local.get({ [JOBS_KEY]: [] });
  return (stored[JOBS_KEY] as DownloadJob[] | undefined) ?? [];
}

async function upsertJob(job: DownloadJob): Promise<void> {
  const jobs = await readJobs();
  const idx = jobs.findIndex((j) => j.jobId === job.jobId);
  if (idx >= 0) {
    jobs[idx] = job;
  } else {
    jobs.unshift(job); // newest first
    // Keep at most 50 completed jobs to avoid unbounded storage growth
    const keep = jobs
      .filter((j) => j.status === "running")
      .concat(jobs.filter((j) => j.status !== "running").slice(0, 50));
    await browser.storage.local.set({ [JOBS_KEY]: keep });
    return;
  }
  await browser.storage.local.set({ [JOBS_KEY]: jobs });
}

export async function listJobs(): Promise<DownloadJob[]> {
  return readJobs();
}

// ── Progress broadcast ───────────────────────────────────────────────────────

function broadcastProgress(job: DownloadJob): void {
  const msg: MDJobProgressMessage = {
    type: "MD_JOB_PROGRESS",
    jobId: job.jobId,
    completedCount: job.completedCount,
    totalCount: job.totalCount,
    failedCount: job.failedCount,
    status: job.status,
    items: job.items,
  };
  void browser.runtime.sendMessage(msg).catch(() => {});
  void broadcastProgressToTabs(job);
}

// ── URL resolution ───────────────────────────────────────────────────────────

async function signBunkrUrl(jsCDN: string, jobId: string): Promise<string> {
  const parsed = new URL(jsCDN);
  const signUrl = `https://glb-apisign.cdn.cr/sign?path=${encodeURIComponent(parsed.pathname)}`;
  void appendLog("debug", `Signing bunkr URL: ${jsCDN}`, jobId);
  const { text } = await crossOriginFetchText(signUrl);
  const json = JSON.parse(text) as { token?: string; ex?: string };
  if (!json.token || !json.ex) throw new Error("bunkr sign API returned unexpected shape");
  return `${jsCDN}?token=${json.token}&ex=${json.ex}`;
}

async function resolveItem(item: GalleryJobItem, jobId: string): Promise<string> {
  if (item.kind === "resolved") return item.imageUrl;

  void appendLog("debug", `Fetching viewer: ${item.viewerUrl}`, jobId);
  const { text } = await crossOriginFetchText(item.viewerUrl);
  const match = new RegExp(item.extractor).exec(text);
  let rawUrl = match?.[1];
  if (rawUrl) {
    rawUrl = rawUrl.replace(/\\/g, "");
  }

  // Fallback: video/audio pages don't use var jsCDN — try <source src="...">,
  // <video src="...">, or <audio src="..."> patterns.
  if (!rawUrl) {
    const sourceMatch =
      /<source\s+[^>]*src=["']([^"']+)["']/i.exec(text) ??
      /<video\s+[^>]*src=["']([^"']+)["']/i.exec(text) ??
      /<audio\s+[^>]*src=["']([^"']+)["']/i.exec(text);
    if (sourceMatch?.[1]) {
      rawUrl = sourceMatch[1].replace(/\\/g, "");
      void appendLog("debug", `Primary extractor missed, found media src: ${rawUrl}`, jobId);
    }
  }

  if (!rawUrl) {
    // Log a snippet of the fetched HTML to help debug extractor mismatches.
    void appendLog(
      "error",
      `Extractor "${item.extractor}" found no match in ${item.viewerUrl} (HTML snippet: ${text.slice(0, 300).replace(/\s+/g, " ")})`,
      jobId,
    );
    throw new Error(`extractor found no match in ${item.viewerUrl}`);
  }

  // Parse filename from viewer page if possible.
  const nameMatch = /<span[^>]+class="name text-ellipsis"[^>]*>([^<]+)<\/span>/i.exec(text);
  if (nameMatch && nameMatch[1]) {
    item.filename = nameMatch[1].trim();
  }

  if (item.needsSign) return signBunkrUrl(rawUrl, jobId);
  return rawUrl;
}

// ── Concurrency queue ────────────────────────────────────────────────────────

// Chrome download interruptions that are worth retrying — the CDN throttled
// us, the network blipped, or the SW crashed mid-transfer. These are not
// permanent file problems; the same URL will likely succeed on retry.
const RETRYABLE_ERRORS = ["SERVER_FAILED", "NETWORK_FAILED", "CRASH"];
const MAX_DOWNLOAD_RETRIES = 3;

function isTransientError(err: unknown): boolean {
  const msg = String(err);
  return RETRYABLE_ERRORS.some((e) => msg.includes(e));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function attemptDownload(url: string, filePath: string): Promise<void> {
  const downloadId = await browser.downloads.download({
    url,
    filename: filePath,
    conflictAction: "uniquify",
  });
  await new Promise<void>((resolve, reject) => {
    pendingDownloads.set(downloadId, { resolve, reject });
  });
}

async function runQueue(
  job: DownloadJob,
  items: GalleryJobItem[],
  maxParallel: number,
): Promise<void> {
  let cursor = 0;

  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      if (!item) continue;

      if (job.items?.[idx]) {
        job.items[idx].status = "running";
        await upsertJob(job);
        broadcastProgress(job);
      }

      let imageUrl: string;
      try {
        imageUrl = await resolveItem(item, job.jobId);
      } catch (resolveErr) {
        void appendLog(
          "error",
          `Resolve failed for item ${idx + 1}: ${String(resolveErr)}`,
          job.jobId,
        );
        job.failedCount++;
        job.completedCount++;
        if (job.items?.[idx]) {
          job.items[idx].status = "error";
          job.items[idx].error = String(resolveErr);
        }
        await upsertJob(job);
        broadcastProgress(job);
        continue;
      }

      // For resolve-viewer items, derive filename from the resolved imageUrl
      // if the item's filename does not contain a file extension. For resolved items,
      // or if item.filename already has the correct basename, keep it.
      const resolvedFilename =
        item.kind === "resolve-viewer" && !item.filename.includes(".")
          ? (new URL(imageUrl).pathname.split("/").at(-1) ?? item.filename)
          : item.filename;
      const filePath = job.subfolder ? `${job.subfolder}/${resolvedFilename}` : resolvedFilename;

      try {
        let succeeded = false;
        let lastErr: unknown;
        for (let attempt = 0; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
          if (attempt > 0) {
            const backoff = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
            void appendLog(
              "debug",
              `Retry ${attempt}/${MAX_DOWNLOAD_RETRIES} for ${resolvedFilename} in ${backoff}ms`,
              job.jobId,
            );
            await sleep(backoff);
          }
          try {
            await attemptDownload(imageUrl, filePath);
            succeeded = true;
            break;
          } catch (dlErr) {
            lastErr = dlErr;
            if (attempt < MAX_DOWNLOAD_RETRIES && isTransientError(dlErr)) continue;
            break;
          }
        }

        if (succeeded) {
          job.completedCount++;
          if (job.items?.[idx]) {
            job.items[idx].status = "done";
            job.items[idx].filename = resolvedFilename;
          }
          void appendLog("debug", `Downloaded: ${filePath}`, job.jobId);
        } else {
          void appendLog("error", `Download failed for ${imageUrl}: ${String(lastErr)}`, job.jobId);
          job.failedCount++;
          job.completedCount++;
          if (job.items?.[idx]) {
            job.items[idx].status = "error";
            job.items[idx].error = String(lastErr);
          }
        }
      } catch (outerErr) {
        // Safety net — shouldn't reach here, but don't let a bug stall the queue.
        void appendLog("error", `Unexpected error for ${imageUrl}: ${String(outerErr)}`, job.jobId);
        job.failedCount++;
        job.completedCount++;
        if (job.items?.[idx]) {
          job.items[idx].status = "error";
          job.items[idx].error = String(outerErr);
        }
      }
      await upsertJob(job);
      broadcastProgress(job);
    }
  }

  const slots = Math.min(job.totalCount, maxParallel);
  await Promise.all(Array.from({ length: slots }, runOne));

  job.status = job.failedCount > 0 ? "error" : "done";
  await upsertJob(job);
  broadcastProgress(job);
  void appendLog(
    "info",
    `Job complete: ${job.completedCount - job.failedCount} ok, ${job.failedCount} failed`,
    job.jobId,
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function startGalleryJob(req: MDGalleryStartRequest): Promise<void> {
  const job: DownloadJob = {
    jobId: req.jobId,
    hosterId: req.hosterId,
    subfolder: req.subfolder,
    totalCount: req.items.length,
    completedCount: 0,
    failedCount: 0,
    status: "running",
    startedAt: Date.now(),
    items: req.items.map((item) => ({
      displayName: item.kind === "resolve-viewer" ? item.viewerUrl : item.imageUrl,
      filename: item.filename,
      status: "pending" as const,
    })),
  };
  await upsertJob(job);
  broadcastProgress(job);
  void appendLog(
    "info",
    `Gallery job started [${req.hosterId}]: ${req.items.length} items → "${req.subfolder || "(no folder)"}", parallel=${req.maxParallel}`,
    job.jobId,
  );
  // Awaiting runQueue keeps the message handler's Promise pending, which tells
  // Chrome to keep the SW alive until all downloads are initiated.
  await runQueue(job, req.items.slice(), req.maxParallel);
}

// Called at SW startup to recover any jobs that were interrupted by SW termination.
export async function resumeRunningJobs(): Promise<void> {
  const jobs = await readJobs();
  for (const job of jobs) {
    if (job.status === "running") {
      job.status = "error";
      await upsertJob(job);
      broadcastProgress(job);
      void appendLog("warn", "Job marked error: SW restarted mid-run", job.jobId);
    }
  }
}

async function broadcastProgressToTabs(job: DownloadJob): Promise<void> {
  const msg = {
    type: "MD_JOB_PROGRESS",
    jobId: job.jobId,
    completedCount: job.completedCount,
    totalCount: job.totalCount,
    status: job.status,
  };
  try {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        await browser.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  } catch {}
}
