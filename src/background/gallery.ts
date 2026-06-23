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
  const { text } = await fetchWithRetry(signUrl, jobId, "sign API");
  const json = JSON.parse(text) as { token?: string; ex?: string };
  if (!json.token || !json.ex) throw new Error("bunkr sign API returned unexpected shape");
  return `${jsCDN}?token=${json.token}&ex=${json.ex}`;
}

// Retry transient HTTP failures (502, 503, 504, network errors) with backoff.
// Both the viewer page fetch and the sign API can hit these under load —
// bunkr's infrastructure throttles aggressively.
async function fetchWithRetry(
  url: string,
  jobId: string,
  label: string,
  maxRetries = 3,
): Promise<{ text: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = 1000 * 2 ** (attempt - 1);
      void appendLog("debug", `Retry ${attempt}/${maxRetries} for ${label} in ${backoff}ms`, jobId);
      await sleep(backoff);
    }
    try {
      return await crossOriginFetchText(url);
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      // Retry on HTTP 5xx and network errors; bail on 4xx (permanent).
      const transient = /HTTP\s+5\d\d/.test(msg) || /Failed to fetch|NetworkError|abort/i.test(msg);
      if (attempt < maxRetries && transient) continue;
      break;
    }
  }
  throw lastErr;
}

async function resolveItem(item: GalleryJobItem, jobId: string): Promise<string> {
  if (item.kind === "resolved") return item.imageUrl;

  void appendLog("debug", `Fetching viewer: ${item.viewerUrl}`, jobId);
  const { text } = await fetchWithRetry(item.viewerUrl, jobId, "viewer page");
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
    // Check for bunkr's maintenance page — the CDN URL is intentionally
    // absent when the hosting server is down for maintenance.
    if (/Server under maintenance/i.test(text)) {
      void appendLog(
        "error",
        `Bunkr server under maintenance for ${item.viewerUrl} — try again later`,
        jobId,
      );
      throw new Error("bunkr server under maintenance");
    }
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
// us, the network blipped, the connection dropped mid-transfer, or the SW
// crashed. These are not permanent file problems; the same URL will likely
// succeed on retry. SERVER_CONTENT_LENGTH_MISMATCH is common on large video
// files when the CDN connection drops before all bytes arrive.
const RETRYABLE_ERRORS = [
  "SERVER_FAILED",
  "SERVER_CONTENT_LENGTH_MISMATCH",
  "NETWORK_FAILED",
  "CRASH",
];
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

// Pair each item with its original index into job.items so we can partition
// items by media type without losing track of which progress slot they own.
type QueueEntry = { item: GalleryJobItem; origIdx: number };

async function runQueue(
  job: DownloadJob,
  entries: QueueEntry[],
  maxParallel: number,
): Promise<void> {
  let cursor = 0;

  async function runOne(): Promise<void> {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      const item = entry.item;
      const idx = entry.origIdx;
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
            const backoff = 1000 * 2 ** (attempt - 1);
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

  const slots = Math.min(entries.length, maxParallel);
  if (slots > 0) await Promise.all(Array.from({ length: slots }, runOne));
}

// ── Public API ───────────────────────────────────────────────────────────────

// Video/audio extensions — these files are large and CDNs throttle parallel
// downloads, so they get a separate (lower) parallelism setting.
const MEDIA_EXTS = new Set([
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "m4v",
  "wmv",
  "flv",
  "mpg",
  "mpeg",
  "ts",
  "3gp",
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "m4a",
  "opus",
  "wma",
]);

function isMediaFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? MEDIA_EXTS.has(ext) : false;
}

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

  // Partition items by media type so videos (large, CDN-throttled) get their
  // own lower-parallelism queue while images stay aggressive.
  const entries = req.items.map((item, i) => ({ item, origIdx: i }));
  const mediaEntries = entries.filter((e) => isMediaFile(e.item.filename));
  const imageEntries = entries.filter((e) => !isMediaFile(e.item.filename));

  void appendLog(
    "info",
    `Gallery job started [${req.hosterId}]: ${req.items.length} items (${imageEntries.length} img, ${mediaEntries.length} media) → "${req.subfolder || "(no folder)"}", parallel=${req.maxParallelImg}/${req.maxParallelVid}`,
    job.jobId,
  );

  // Run both queues concurrently — images at maxParallelImg, media at maxParallelVid.
  // Both share the same job counters; job completes when both queues drain.
  await Promise.all([
    runQueue(job, imageEntries, req.maxParallelImg),
    runQueue(job, mediaEntries, req.maxParallelVid),
  ]);

  job.status = job.failedCount > 0 ? "error" : "done";
  await upsertJob(job);
  broadcastProgress(job);
  void appendLog(
    "info",
    `Job complete: ${job.completedCount - job.failedCount} ok, ${job.failedCount} failed`,
    job.jobId,
  );
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
