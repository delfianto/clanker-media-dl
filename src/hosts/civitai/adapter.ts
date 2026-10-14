import { isMDMessage } from "../../content/shared/message-data";
import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import type { MDGalleryStartRequest } from "../../types/messages";
import { injectHosterStyles, type GalleryCtx } from "../../content/shared/gallery-ui";
import { carouselItems, collectCarousel, readCarousel } from "./carousel";
import { carouselSubfolder, readSelectedModelVariant } from "./folders";

let cleanup: (() => void) | undefined;
let activeConfig: MDConfig;

export function activate(model: HosterModel, config: MDConfig): void {
  activeConfig = config;
  // The isolated relay sends config again on every slide URL change. Keep the
  // collector and active job alive across those changes.
  if (cleanup) return;
  injectHosterStyles(
    "civitai",
    `
    .md-civitai-carousel-control { position: relative; display: inline-flex; flex: 0 0 auto; }
    .md-civitai-carousel-btn { background: #0d9488 !important; color: #fff !important;
      border: 0; border-radius: 50%; width: 36px; height: 36px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 0 0 1px #2dd4bf66; transition: background 0.15s, box-shadow 0.15s; }
    .md-civitai-carousel-btn:hover:not(:disabled) { background: #0f766e !important;
      box-shadow: 0 0 0 2px #2dd4bf99; }
    .md-civitai-carousel-btn:focus-visible { outline: 2px solid #5eead4; outline-offset: 3px; }
    .md-civitai-carousel-btn:disabled { opacity: 0.65; cursor: default; }
    .md-civitai-carousel-status { display: none; position: absolute; top: calc(100% + 8px); right: 0;
      z-index: 10000; width: max-content; max-width: min(300px, 80vw);
      background: #18181b; color: #fff; padding: 6px 10px; box-shadow: 0 2px 8px #0006;
      border-radius: 6px; font: 12px sans-serif; overflow-wrap: anywhere; pointer-events: none; }
    .md-civitai-carousel-control:hover .md-civitai-carousel-status:not(:empty),
    .md-civitai-carousel-control:has(.md-civitai-carousel-btn:focus-visible)
      .md-civitai-carousel-status:not(:empty) { display: block; }
  `,
  );
  const control = document.createElement("div");
  control.className = "md-civitai-carousel-control";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "md-civitai-carousel-btn";
  btn.title = "Download every image and video in this carousel with its original filename";
  const status = document.createElement("div");
  status.className = "md-civitai-carousel-status";
  status.setAttribute("role", "status");
  control.append(btn, status);
  const controller = new AbortController();
  let activeNode: Element | null = null;
  let collecting = false;
  let activeJob = "";
  let nativeIconMarkup = "";

  function setLabel(label: string, showStatus = false): void {
    btn.title = label;
    btn.setAttribute("aria-label", label);
    if (showStatus) status.textContent = label;
  }

  function update(): void {
    // Scan only media nodes; walk their fiber ancestors, never the entire React
    // tree. This also covers slides that render a placeholder before revealing.
    const candidates = document.querySelectorAll("img, video, [class*='embla']");
    let found: Element | null = null;
    for (const node of candidates) {
      if (readCarousel(node)) found = node;
    }
    activeNode = found;
    if (!found) {
      control.remove();
      return;
    }
    const scope = found.closest('[role="dialog"]') ?? document.body;
    const nativeIcon = Array.from(
      scope.querySelectorAll<SVGElement>("svg.icon-tabler-download, svg.tabler-icon-download"),
    ).find((icon) => !control.contains(icon) && icon.closest("button"));
    const nativeButton = nativeIcon?.closest("button");
    if (!nativeButton || !nativeIcon || !nativeButton.parentElement) {
      control.remove();
      return;
    }
    // Copy the site's actual SVG, including its size, paths, and stroke. Keep
    // our own button and click handler so the native single-file action is intact.
    if (nativeIconMarkup !== nativeIcon.outerHTML) {
      nativeIconMarkup = nativeIcon.outerHTML;
      const icon = nativeIcon.cloneNode(true) as SVGElement;
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("focusable", "false");
      btn.replaceChildren(icon);
      btn.className = `${nativeButton.className} md-civitai-carousel-btn`;
    }
    if (control.nextElementSibling !== nativeButton) {
      nativeButton.parentElement.insertBefore(control, nativeButton);
    }
    if (!collecting && !activeJob) {
      const state = readCarousel(found);
      setLabel(
        `Download carousel (${state?.images.length ?? 0}${state?.hasMore ? "+" : ""}) — original filenames. Shift-click to download again`,
      );
    }
  }

  btn.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (collecting || activeJob || !activeNode) return;
    collecting = true;
    btn.disabled = true;
    status.textContent = "";
    // Keep the same carousel for the whole collection. Closing or replacing it
    // fails the collection instead of accidentally queuing another gallery.
    const node = activeNode;
    // Snapshot before pagination: changing the selected version while collecting
    // must not rename this batch after a different version's pill.
    const config = activeConfig;
    const variantName = readSelectedModelVariant();
    const modelId = /\/models\/(\d+)/.exec(location.pathname)?.[1];
    try {
      const images = await collectCarousel(
        () => (node.isConnected ? readCarousel(node) : null),
        (count) => {
          setLabel(`Collecting carousel (${count})…`, true);
        },
        controller.signal,
      );
      const items = carouselItems(images, location.origin);
      if (!items.length) throw new Error("This carousel contains no downloadable media.");
      const state = readCarousel(node);
      const firstId = images[0]?.id ?? "gallery";
      const albumName = modelId
        ? `Civitai model ${modelId} - carousel ${firstId}`
        : `Civitai carousel ${firstId}`;
      if (!state) throw new Error("Carousel closed while collecting media.");
      activeJob = crypto.randomUUID();
      const request: MDGalleryStartRequest = {
        type: "MD_GALLERY_START",
        jobId: activeJob,
        hosterId: model.id,
        subfolder: carouselSubfolder(albumName, variantName, items.length, config),
        items,
        maxParallelImg: config.maxParallelImg,
        maxParallelVid: config.maxParallelVid,
        ...(event.shiftKey ? { skipExistingFiles: false } : {}),
      };
      setLabel(`Queued ${items.length} files…`, true);
      window.postMessage(request, "*");
    } catch (error) {
      if (!controller.signal.aborted) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
      activeJob = "";
      btn.disabled = false;
    } finally {
      collecting = false;
    }
  });

  function onProgress(event: MessageEvent): void {
    if (
      event.source !== window ||
      !isMDMessage(event.data) ||
      !["MD_JOB_PROGRESS", "MD_GALLERY_ERROR"].includes(event.data.type) ||
      event.data.jobId !== activeJob
    )
      return;
    const data = event.data;
    if (data.type === "MD_GALLERY_ERROR") {
      status.textContent = `Could not queue downloads: ${data.error}`;
      activeJob = "";
      btn.disabled = false;
      update();
      return;
    }
    setLabel(`Downloading ${data.completedCount}/${data.totalCount}…`, true);
    if (typeof data.status === "string" && ["done", "error", "canceled"].includes(data.status)) {
      status.textContent =
        data.status === "done"
          ? typeof data.skippedCount === "number" && data.skippedCount > 0
            ? `Downloaded ${Number(data.completedCount) - data.skippedCount} files; ${data.skippedCount} already downloaded. Shift-click to download again.`
            : `Downloaded ${data.completedCount} files.`
          : data.status === "canceled"
            ? "Download canceled."
            : `${data.failedCount} downloads failed. See Downloads in extension settings.`;
      activeJob = "";
      btn.disabled = false;
      update();
    }
  }
  window.addEventListener("message", onProgress);
  // A lightweight interval also observes React state updates that don't mutate
  // the DOM. Keep one lifecycle across slide URL changes and carousel reopening.
  let lastStatusCheck = 0;
  const timer = setInterval(() => {
    update();
    if (activeJob && Date.now() - lastStatusCheck >= 5_000) {
      lastStatusCheck = Date.now();
      window.postMessage({ type: "MD_JOB_STATUS", jobId: activeJob }, "*");
    }
  }, 750);
  update();
  cleanup = () => {
    controller.abort();
    clearInterval(timer);
    window.removeEventListener("message", onProgress);
    control.remove();
  };
}

export function activateGallery(_model: HosterModel, _ctx: GalleryCtx): void {}
