import { isMDMessage } from "./shared/message-data";
import browser from "webextension-polyfill";
import type { MDConfig, Settings } from "../types/global";
import type { HosterModel } from "../types/hoster";
import type {
  MDBlobResult,
  MDFetchBlobRequest,
  MDFetchBlobResponse,
  MDGalleryStartRequest,
  MDMainRequest,
  MDMainResponse,
} from "../types/messages";
import { ALL_MODELS } from "../hosts/index";
import { DEFAULT_SETTINGS } from "../settings/schema";
import { applyStorageChanges } from "../settings/storage-changes";

// ISOLATED world, document_idle, on viewer + gallery pages. Responsibilities:
//   1. resolve which hoster this page belongs to + whether it's viewer or gallery,
//   2. inject the user's CSS overrides (viewer pages only),
//   3. hand the matched hoster id + pageType + gallery settings to MAIN world,
//   4. relay MAIN's single-image fetch requests to the SW and post bytes back,
//   5. relay MAIN's gallery start requests to the SW (fire-and-forget).

// MV3 match pattern → anchored RegExp.
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

type PageMatch = { model: HosterModel; pageType: "viewer" | "gallery" };

function matchPage(href: string, pathname: string): PageMatch | undefined {
  for (const model of ALL_MODELS) {
    const gc = model.galleryConfig;

    // Check gallery matches first.
    if (gc?.galleryMatches.some((p) => patternToRegex(p).test(href))) {
      const guard = gc.pathGuard;
      if (!guard || new RegExp(guard).test(pathname)) {
        if (gc.viewerIndicator) {
          // imagebam: viewer and gallery share /view/*. If the viewerIndicator
          // element IS present we're on a single-image viewer; fall through.
          if (!document.querySelector(gc.viewerIndicator)) {
            return { model, pageType: "gallery" };
          }
        } else {
          return { model, pageType: "gallery" };
        }
      }
    }

    // Viewer match.
    if (model.viewerMatches.some((p) => patternToRegex(p).test(href))) {
      const guard = model.downloadConfig.pathGuard;
      if (!guard || new RegExp(guard).test(pathname)) {
        return { model, pageType: "viewer" };
      }
    }
  }
  return undefined;
}

function injectCss(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  (document.head ?? document.documentElement).appendChild(style);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Promise-wrap runtime access too: after an extension reload Chrome may throw
// synchronously, before sendMessage() has returned a Promise to attach catch to.
async function sendToBackground(message: unknown): Promise<unknown> {
  try {
    if (!browser.runtime.id) throw new Error("Extension context invalidated");
    return await browser.runtime.sendMessage(message);
  } catch (error) {
    if (/Extension context invalidated/i.test(String(error))) {
      throw new Error("Extension was reloaded. Reload this page to reconnect the download button.");
    }
    throw error;
  }
}

async function relayJobStatus(jobId: string): Promise<void> {
  try {
    const response = await sendToBackground({ type: "MD_JOB_STATUS", jobId });
    if (isMDMessage(response) && response.type === "MD_JOB_PROGRESS") {
      window.postMessage(response, "*");
    }
  } catch (error) {
    window.postMessage(
      {
        type: "MD_GALLERY_ERROR",
        jobId,
        error: error instanceof Error ? error.message : String(error),
      },
      "*",
    );
  }
}

function onMainMessage(event: MessageEvent): void {
  if (event.source !== window || !isMDMessage(event.data)) return;
  const data = event.data as Record<string, unknown>;
  const type = data["type"];

  if (type === "MD_REQUEST") {
    const req = data as unknown as MDMainRequest;
    if (typeof req.id === "string" && typeof req.url === "string") {
      void relayBlob(req.id, req.url);
    }
    return;
  }

  if (type === "MD_DOWNLOAD_SINGLE") {
    const req = data as { id: string; url: string; filename: string; subfolder: string };
    if (
      typeof req.id === "string" &&
      typeof req.url === "string" &&
      typeof req.filename === "string"
    ) {
      void relayDownloadSingle(req.id, req.url, req.filename, req.subfolder || "");
    }
    return;
  }

  if (type === "MD_GALLERY_START") {
    // Fire-and-forget: no response needed in MAIN world; SW handles progress.
    // Surface relay errors that were previously swallowed — a silent failure
    // here makes the button reset to dlIcon without any job appearing in
    // History, which is exactly the "spinner spins and stops, nothing
    // downloaded" symptom for the user.
    const req = data as unknown as MDGalleryStartRequest;
    const itemCount = req.items?.length ?? 0;
    console.log(
      `[md] isolated: relaying MD_GALLERY_START to SW — jobId=${req.jobId} items=${itemCount} hoster=${req.hosterId}`,
    );
    void sendToBackground(data)
      .then(() => {
        console.log(`[md] isolated: SW accepted MD_GALLERY_START (jobId=${req.jobId})`);
      })
      .catch((err: unknown) => {
        console.error(`[md] isolated: SW rejected MD_GALLERY_START (jobId=${req.jobId}):`, err);
        window.postMessage(
          {
            type: "MD_GALLERY_ERROR",
            jobId: req.jobId,
            error: err instanceof Error ? err.message : String(err),
          },
          "*",
        );
      });
    return;
  }

  if (type === "MD_JOB_STATUS" && typeof data["jobId"] === "string") {
    void relayJobStatus(data["jobId"]);
    return;
  }

  // Crawl-phase relays (MAIN → SW, fire-and-forget). The SW owns the crawl job
  // lifecycle; progress flows back to MAIN via the MD_JOB_PROGRESS forwarder
  // below, which the gallery-runner listens to for cancellation + button text.
  if (type === "MD_CRAWL_START" || type === "MD_CRAWL_PROGRESS" || type === "MD_CRAWL_DONE") {
    void sendToBackground(data).catch(() => {});
    return;
  }
}

async function relayDownloadSingle(
  id: string,
  url: string,
  filename: string,
  subfolder: string,
): Promise<void> {
  let result: MDBlobResult;
  try {
    const res = (await sendToBackground({
      type: "MD_DOWNLOAD_SINGLE",
      url,
      filename,
      subfolder,
    })) as { error?: string } | void;
    result =
      res && "error" in res && res.error
        ? { error: res.error }
        : { buffer: new ArrayBuffer(0), contentType: "" };
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) };
  }

  const response: MDMainResponse = { type: "MD_RESPONSE", id, result };
  window.postMessage(response, "*");
}

async function relayBlob(id: string, url: string): Promise<void> {
  let result: MDBlobResult;
  try {
    const request: MDFetchBlobRequest = { type: "MD_FETCH_BLOB", url };
    const res = (await sendToBackground(request)) as MDFetchBlobResponse;
    result =
      "error" in res
        ? { error: res.error }
        : { buffer: base64ToBuffer(res.base64), contentType: res.contentType };
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) };
  }

  const response: MDMainResponse = { type: "MD_RESPONSE", id, result };
  if ("buffer" in result) {
    window.postMessage(response, "*", [result.buffer]);
  } else {
    window.postMessage(response, "*");
  }
}

async function init(): Promise<void> {
  let settings: Settings;
  try {
    const keys = { ...DEFAULT_SETTINGS, subfolderPrefix: "" };
    const raw = (await browser.storage.local.get(keys)) as any;
    settings = raw as Settings;
    settings.hosters = { ...DEFAULT_SETTINGS.hosters, ...settings.hosters };
    settings.downloadDirectory ??= raw.subfolderPrefix ?? DEFAULT_SETTINGS.downloadDirectory;
  } catch {
    settings = DEFAULT_SETTINGS;
  }
  if (!settings.enabled) return;

  let lastUrl = location.href;

  function checkAndTrigger(configOnly = false) {
    if (!settings.enabled) return;
    const match = matchPage(location.href, location.pathname);
    console.log("[md] isolated checkAndTrigger, url:", location.href, "match:", match);
    if (!match) return;

    const { model, pageType } = match;
    const override = settings.hosters[model.id];
    if (!override?.enabled) return;

    if (!configOnly) model.onPageEnter?.();

    if (!configOnly && pageType === "viewer" && override.cssOverrides)
      injectCss(override.cssOverrides);

    const config: MDConfig = {
      hosterId: model.id,
      pageType,
      maxParallelImg: settings.maxParallelImg,
      maxParallelVid: settings.maxParallelVid,
      downloadDirectory: settings.downloadDirectory,
      autoFolderPerAlbum: settings.autoFolderPerAlbum,
      useFallbackName: override.useFallbackName ?? false,
      ...(model.id === "civitai"
        ? {
            useModelVariantAsGalleryName:
              override.useModelVariantAsGalleryName ??
              DEFAULT_SETTINGS.hosters.civitai.useModelVariantAsGalleryName ??
              true,
            skipFolderWhenSingleImage:
              override.skipFolderWhenSingleImage ??
              DEFAULT_SETTINGS.hosters.civitai.skipFolderWhenSingleImage ??
              true,
          }
        : {}),
    };
    document.dispatchEvent(new CustomEvent("__md_config__", { detail: JSON.stringify(config) }));
  }

  checkAndTrigger();

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    settings = applyStorageChanges(settings, changes);
    // Civitai's activate() updates its config without replacing its collector,
    // button, or active job. Re-send through the existing world bridge so the
    // next click uses saved settings even if this SPA tab has not navigated.
    if (matchPage(location.href, location.pathname)?.model.id === "civitai") {
      checkAndTrigger(true);
    }
  });

  // Poll for SPA location changes
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      checkAndTrigger();
    }
  }, 500);

  window.addEventListener("message", onMainMessage);

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (!isMDMessage(msg)) return;
    const m = msg;
    if (m["type"] === "MD_JOB_PROGRESS") {
      console.log(
        `[md] isolated: received MD_JOB_PROGRESS from SW — jobId=${m["jobId"]} status=${m["status"]} completed=${m["completedCount"]}/${m["totalCount"]} failed=${m["failedCount"] ?? 0}`,
      );
      window.postMessage(m, "*");
    }
  });
}

void init().catch(() => {});
