import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import type { CrawlResult } from "../../types/hoster";
import type { GalleryJobItem, MDGalleryStartRequest } from "../../types/messages";
import type { GalleryCtx } from "./gallery-ui";
import {
  collectThumbnailTransform,
  collectAnchorHref,
  collectResolveViewer,
  collectPageUrls,
  fetchAdditionalItems,
  mapWithConcurrency,
  buildSubfolder,
} from "./collector";

// Default concurrency for crawl-item fetches. Individual hosters can override
// via crawlConfig.crawlConcurrency.
const DEFAULT_CRAWL_CONCURRENCY = 8;

function crawlLabel(resolved: number, failed: number, total: number): string {
  const suffix = failed > 0 ? ` (${failed} failed)` : "";
  return `<span class="btn-icon" style="margin-right:6px;font-size:16px;">⏳</span> <span class="btn-text">Crawling ${resolved}/${total}…${suffix}</span>`;
}

// ── Main entry ───────────────────────────────────────────────────────────────

// Each hoster's adapter exports an activateGallery function that owns its
// button HTML, placement, and progress wiring. The shared runner collects
// items, handles pagination, and dispatches to the adapter. It has ZERO
// knowledge of any specific hoster — all hoster-specific logic lives in the
// model's hooks (collectAllItems, crawlConfig, extractFromViewer, etc.).
export type GalleryAdapterFn = (model: HosterModel, ctx: GalleryCtx) => void;

let activeInterval: any = null;

export function runGalleryAdapter(
  model: HosterModel,
  config: MDConfig,
  activateGallery: GalleryAdapterFn,
): void {
  const gc = model.galleryConfig;
  if (!gc) return;

  console.log(
    "[md] runGalleryAdapter initializing for model:",
    model.id,
    "waitForSelector:",
    gc.waitForSelector,
  );

  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }

  // Remove any previously injected gallery buttons to avoid duplicates on SPA transitions
  document.querySelectorAll("[class*='gallery-btn']").forEach((el) => el.remove());
  document.querySelectorAll(".md-gallery-btn-wrap").forEach((el) => el.remove());

  async function run(): Promise<void> {
    console.log("[md] runGalleryAdapter: run() triggered");
    const albumIdMatch = new RegExp(gc!.albumIdFromPath).exec(location.pathname);
    const albumId = albumIdMatch?.[1] ?? location.pathname.split("/").at(-1) ?? "album";

    const albumName = model.getGalleryName
      ? ((await model.getGalleryName(document)) ?? albumId)
      : (document.querySelector(gc!.albumNameSelector)?.textContent?.trim() ?? albumId);

    // Prefer the model's custom collector (e.g. Bunkr reads window.albumFiles for
    // the full list regardless of pagination/view mode). Fall back to strategy-
    // based DOM scraping for other hosters.
    const useFallback = config.useFallbackName ?? false;
    let items: GalleryJobItem[];
    if (gc!.collectAllItems) {
      items = await gc!.collectAllItems();
    } else {
      switch (gc!.imageSource.strategy) {
        case "thumbnail-transform":
          items = collectThumbnailTransform(gc!);
          break;
        case "anchor-href":
          items = collectAnchorHref(gc!);
          break;
        case "resolve-viewer":
          items = collectResolveViewer(gc!, document, useFallback);
          break;
      }
    }

    console.log("[md] runGalleryAdapter: items collected length =", items.length);
    if (items.length === 0) return;

    const subfolder = buildSubfolder(albumName, config);

    // Shared triggerDownload — handles pagination + de-duplication, then posts
    // the MDGalleryStartRequest to the ISOLATED world relay. Each adapter's
    // button click handler calls this.
    async function triggerDownload(
      btnElement: HTMLElement,
      loadingIcon: string,
      doneIcon: string,
    ): Promise<string> {
      btnElement.classList.add("loading");

      const otherPageUrls = collectPageUrls();
      let jobItems = items.slice();
      if (otherPageUrls.length > 0) {
        btnElement.innerHTML = loadingIcon;
        const extra = await fetchAdditionalItems(otherPageUrls, gc!, useFallback);
        jobItems.push(...extra);

        // De-duplicate
        const seen = new Set<string>();
        jobItems = jobItems.filter((item) => {
          const key = item.kind === "resolve-viewer" ? item.viewerUrl : item.imageUrl;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // ── Crawl phase (aggregator hosters only) ───────────────────────────
      // When the model defines crawlConfig AND the collected items include
      // crawl items, enter a visible + cancellable crawl phase. Each crawl item
      // is expanded via the model's crawlItem hook (which owns all hoster-
      // specific resolution — API endpoints, parsing, thumbnail transforms,
      // naming, sorting). Only after the crawl completes un-aborted do we post
      // the per-set download jobs. The shared runner owns only the job
      // lifecycle (progress, cancellation, concurrency) — it knows nothing
      // about which hoster or what API is being crawled.
      const crawlConfig = gc!.crawlConfig;
      if (crawlConfig) {
        const crawlItems = jobItems.filter(crawlConfig.isCrawlItem);
        if (crawlItems.length > 0) {
          const crawlId = crypto.randomUUID();
          const setCount = crawlItems.length;
          const controller = new AbortController();
          let crawlCancelled = false;
          let resolvedCount = 0;
          let failedCount = 0;

          // Crawl cancellation arrives as an MD_JOB_PROGRESS with our crawlId +
          // status "canceled" (SW broadcast when the user hits Stop on the crawl
          // card or Stop All). The ISOLATED world forwards it to MAIN, so we can
          // abort in-flight fetches and suppress the download burst.
          const crawlCancelListener = (event: MessageEvent): void => {
            if (event.source !== window) return;
            const d = event.data as Record<string, unknown>;
            if (
              d["type"] === "MD_JOB_PROGRESS" &&
              d["jobId"] === crawlId &&
              d["status"] === "canceled"
            ) {
              crawlCancelled = true;
              controller.abort();
            }
          };
          window.addEventListener("message", crawlCancelListener);

          btnElement.innerHTML = crawlLabel(0, 0, setCount);
          window.postMessage(
            {
              type: "MD_CRAWL_START",
              crawlId,
              hosterId: model.id,
              albumName,
              setCount,
            },
            "*",
          );

          const crawlResults = await mapWithConcurrency(
            crawlItems,
            crawlConfig.crawlConcurrency ?? DEFAULT_CRAWL_CONCURRENCY,
            controller.signal,
            async (item) => {
              try {
                const result = await crawlConfig.crawlItem(item, model, config);
                if (result) {
                  resolvedCount++;
                }
                return result;
              } catch (err) {
                if (!controller.signal.aborted) {
                  failedCount++;
                  const label = item.kind === "resolve-viewer" ? item.viewerUrl : item.imageUrl;
                  console.error(`[md] failed to crawl ${label}:`, err);
                }
                return null;
              } finally {
                if (!controller.signal.aborted) {
                  window.postMessage(
                    {
                      type: "MD_CRAWL_PROGRESS",
                      crawlId,
                      resolvedCount,
                      failedCount,
                      setCount,
                    },
                    "*",
                  );
                  btnElement.innerHTML = crawlLabel(resolvedCount, failedCount, setCount);
                }
              }
            },
          );

          window.removeEventListener("message", crawlCancelListener);

          const aborted = crawlCancelled || controller.signal.aborted;
          window.postMessage({ type: "MD_CRAWL_DONE", crawlId, aborted }, "*");

          if (aborted) {
            btnElement.innerHTML = doneIcon;
            btnElement.classList.remove("loading");
            return "";
          }

          // Crawl complete — build the download job list and post it. The
          // model's sortCrawlResults hook controls ordering (e.g. by date);
          // insertion order is preserved when absent.
          const validResults = crawlResults.filter((r): r is CrawlResult => r !== null);
          if (crawlConfig.sortCrawlResults) {
            validResults.sort(crawlConfig.sortCrawlResults);
          }

          for (const res of validResults) {
            window.postMessage(res.req, "*");
          }

          btnElement.innerHTML = doneIcon;
          // Return the crawl ID so the button resets when the crawl job
          // completes (not when every download finishes — the downloads run
          // in the background and are tracked in the History tab).
          return crawlId;
        }
      }

      // ── Simple gallery (no crawl phase) ─────────────────────────────────
      btnElement.innerHTML = loadingIcon;

      const jobId = crypto.randomUUID();
      const req: MDGalleryStartRequest = {
        type: "MD_GALLERY_START",
        jobId,
        hosterId: model.id,
        subfolder,
        items: jobItems,
        maxParallelImg: config.maxParallelImg,
        maxParallelVid: config.maxParallelVid,
      };
      window.postMessage(req, "*");
      return jobId;
    }

    const ctx: GalleryCtx = { items, subfolder, albumName, triggerDownload };
    activateGallery(model, ctx);
  }

  if (gc.waitForSelector && !document.querySelector(gc.waitForSelector)) {
    const selector = gc.waitForSelector;
    let elapsed = 0;
    activeInterval = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(activeInterval);
        activeInterval = null;
        void run();
      } else {
        elapsed += 250;
        if (elapsed >= 10000) {
          clearInterval(activeInterval);
          activeInterval = null;
          console.warn(`[md] Timed out waiting for selector: ${selector}`);
        }
      }
    }, 250);
  } else {
    void run();
  }
}
