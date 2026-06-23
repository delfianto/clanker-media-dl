import type { MDConfig } from "../../types/global";
import type { GalleryConfig, HosterModel } from "../../types/hoster";
import type { GalleryJobItem, MDGalleryStartRequest } from "../../types/messages";
import { createDownloadAllButton, injectGalleryStyles } from "./gallery-ui";

function buildSubfolder(albumName: string, config: MDConfig): string {
  if (!config.autoFolderPerAlbum) return config.downloadDirectory;
  const safeName = albumName.replace(new RegExp('[/\\\\:*?"<>|]', "g"), "_").trim();
  return config.downloadDirectory ? `${config.downloadDirectory}/${safeName}` : safeName;
}

// ── URL helpers ──────────────────────────────────────────────────────────────

function basenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split("/").at(-1) ?? "file";
  } catch {
    return "file";
  }
}

// ── Strategy: thumbnail-transform ───────────────────────────────────────────

function collectThumbnailTransform(
  gc: GalleryConfig,
  doc: Document | Element = document,
): GalleryJobItem[] {
  const src = gc.imageSource;
  if (src.strategy !== "thumbnail-transform") return [];
  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>(src.selector));
  return imgs
    .map((img) => img.src)
    .filter(Boolean)
    .map((thumbSrc) => {
      const imageUrl = src.buildUrl(thumbSrc);
      return { kind: "resolved" as const, imageUrl, filename: basenameFromUrl(imageUrl) };
    });
}

// ── Strategy: anchor-href ────────────────────────────────────────────────────

function collectAnchorHref(
  gc: GalleryConfig,
  doc: Document | Element = document,
): GalleryJobItem[] {
  const src = gc.imageSource;
  if (src.strategy !== "anchor-href") return [];
  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>(src.imageSelector));
  return imgs
    .map((img) => img.src)
    .filter(Boolean)
    .map((imageUrl) => ({
      kind: "resolved" as const,
      imageUrl,
      filename: basenameFromUrl(imageUrl),
    }));
}

// ── Strategy: resolve-viewer ─────────────────────────────────────────────────

function collectResolveViewer(
  gc: GalleryConfig,
  doc: Document | Element = document,
): GalleryJobItem[] {
  const src = gc.imageSource;
  if (src.strategy !== "resolve-viewer") return [];
  const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>(src.anchorSelector));
  return anchors
    .filter((a) => !!a.href)
    .map((a) => {
      const viewerUrl = a.href;
      let filename = viewerUrl.split("/").at(-1) ?? "file";
      if (src.filenameSelector) {
        const nameEl = a.querySelector(src.filenameSelector);
        if (nameEl?.textContent) {
          filename = nameEl.textContent.trim();
        }
      }
      const item: GalleryJobItem = {
        kind: "resolve-viewer",
        viewerUrl,
        extractor: src.extractor,
        filename,
      };
      if (src.needsSign) {
        return { ...item, needsSign: true as const };
      }
      return item;
    });
}

// ── Pagination helpers ────────────────────────────────────────────────────────

function collectPageUrls(): string[] {
  const pagination = document.querySelector(
    ".pagination, .pages, [class*='pagination'], .paginator",
  );
  if (!pagination) return [];
  const links = Array.from(pagination.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const currentPath = window.location.pathname;
  const urls = links
    .map((a) => {
      try {
        return new URL(a.href, window.location.href);
      } catch {
        return null;
      }
    })
    .filter(
      (u): u is URL =>
        u !== null && u.origin === window.location.origin && u.pathname === currentPath,
    )
    .map((u) => u.href);
  return Array.from(new Set(urls)).filter((href) => href !== window.location.href);
}

async function fetchAdditionalItems(
  pageUrls: string[],
  gc: GalleryConfig,
): Promise<GalleryJobItem[]> {
  const allItems: GalleryJobItem[] = [];
  const parser = new DOMParser();

  // Fetch all pages in parallel
  const htmlTexts = await Promise.all(
    pageUrls.map((url) =>
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .catch((err) => {
          console.error(`[md] failed to fetch page ${url}:`, err);
          return "";
        }),
    ),
  );

  for (const html of htmlTexts) {
    if (!html) continue;
    try {
      const doc = parser.parseFromString(html, "text/html");
      let pageItems: GalleryJobItem[] = [];
      switch (gc.imageSource.strategy) {
        case "thumbnail-transform":
          pageItems = collectThumbnailTransform(gc, doc);
          break;
        case "anchor-href":
          pageItems = collectAnchorHref(gc, doc);
          break;
        case "resolve-viewer":
          pageItems = collectResolveViewer(gc, doc);
          break;
      }
      allItems.push(...pageItems);
    } catch (e) {
      console.error("[md] failed to parse page document:", e);
    }
  }

  return allItems;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function runGalleryAdapter(model: HosterModel, config: MDConfig): void {
  const gc = model.galleryConfig;
  if (!gc) return;

  const albumIdMatch = new RegExp(gc.albumIdFromPath).exec(location.pathname);
  const albumId = albumIdMatch?.[1] ?? location.pathname.split("/").at(-1) ?? "album";

  const albumName = model.getGalleryName
    ? (model.getGalleryName(document) ?? albumId)
    : (document.querySelector(gc.albumNameSelector)?.textContent?.trim() ?? albumId);

  // Prefer the model's custom collector (e.g. Bunkr reads window.albumFiles for
  // the full list regardless of pagination/view mode). Fall back to strategy-
  // based DOM scraping for other hosters.
  let items: GalleryJobItem[];
  if (gc.collectAllItems) {
    items = gc.collectAllItems();
  } else {
    switch (gc.imageSource.strategy) {
      case "thumbnail-transform":
        items = collectThumbnailTransform(gc);
        break;
      case "anchor-href":
        items = collectAnchorHref(gc);
        break;
      case "resolve-viewer":
        items = collectResolveViewer(gc);
        break;
    }
  }

  if (items.length === 0) return;

  const note =
    gc.imageSource.strategy === "anchor-href" && !gc.collectAllItems
      ? "Current page only — pagination not yet supported"
      : undefined;

  const subfolder = buildSubfolder(albumName, config);

  async function triggerDownload(
    btnElement: HTMLElement,
    loadingIcon: string,
    _doneIcon: string,
  ): Promise<string> {
    btnElement.classList.add("loading");

    const otherPageUrls = collectPageUrls();
    let jobItems = items.slice();
    if (otherPageUrls.length > 0) {
      btnElement.innerHTML = loadingIcon + "Fetching pages...";
      const extra = await fetchAdditionalItems(otherPageUrls, gc);
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

    btnElement.innerHTML = loadingIcon + "Starting...";

    const jobId = crypto.randomUUID();
    const req: MDGalleryStartRequest = {
      type: "MD_GALLERY_START",
      jobId,
      hosterId: model.id,
      subfolder,
      items: jobItems,
      maxParallel: config.maxParallel,
    };
    window.postMessage(req, "*");
    return jobId;
  }

  const viewSwitches = document.querySelector(".view-switches");
  if (model.id === "imagebam" && viewSwitches) {
    injectGalleryStyles();
    const dlBtn = document.createElement("a");
    dlBtn.href = "javascript:void(0);";
    dlBtn.className = "md-ib-gallery-btn";
    dlBtn.title = "Download Gallery";
    dlBtn.innerHTML = '<i class="fa fa-download"></i>';

    let activeJobId = "";
    dlBtn.addEventListener("click", async () => {
      if (activeJobId) return;
      activeJobId = "loading";
      activeJobId = await triggerDownload(
        dlBtn,
        '<i class="fa fa-spinner fa-spin"></i> ',
        '<i class="fa fa-download"></i>',
      );
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data as Record<string, unknown>;
      if (data["type"] === "MD_JOB_PROGRESS" && data["jobId"] === activeJobId) {
        const status = data["status"];
        if (status === "done" || status === "error") {
          dlBtn.innerHTML = '<i class="fa fa-download"></i>';
          dlBtn.classList.remove("loading");
          activeJobId = "";
        }
      }
    });

    viewSwitches.prepend(dlBtn);
    return;
  }

  const albumHeader = document.querySelector("h1");
  if (model.id === "imgbox" && albumHeader) {
    injectGalleryStyles();
    const dlIconSvg = '<i class="icon-cloud-download"></i>';
    const loadingIconSvg =
      '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="display: inline-block; vertical-align: middle; animation: md-spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="currentColor" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>';
    const dlBtn = document.createElement("a");
    dlBtn.href = "javascript:void(0);";
    dlBtn.className = "btn btn-inverse md-imgbox-gallery-btn";
    dlBtn.title = "Download Gallery";
    dlBtn.innerHTML = dlIconSvg;

    let activeJobId = "";
    dlBtn.addEventListener("click", async () => {
      if (activeJobId) return;
      activeJobId = "loading";
      activeJobId = await triggerDownload(dlBtn, loadingIconSvg, dlIconSvg);
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data as Record<string, unknown>;
      if (data["type"] === "MD_JOB_PROGRESS" && data["jobId"] === activeJobId) {
        const status = data["status"];
        if (status === "done" || status === "error") {
          dlBtn.innerHTML = dlIconSvg;
          dlBtn.classList.remove("loading");
          activeJobId = "";
        }
      }
    });

    albumHeader.appendChild(dlBtn);
    if (albumHeader instanceof HTMLElement) {
      albumHeader.style.display = "flex";
      albumHeader.style.justifyContent = "space-between";
      albumHeader.style.alignItems = "center";
    }
    return;
  }

  const tools = document.querySelector(".album-toolbar .left-tools");
  const toggleBtn = tools?.querySelector(".mode-toggle-btn");
  if (model.id === "bunkr" && tools) {
    injectGalleryStyles();
    const dlIconSvg =
      '<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    const loadingIconSvg =
      '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="display: inline-block; vertical-align: middle; animation: md-spin 1s linear infinite; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="currentColor" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>';
    const dlBtn = document.createElement("a");
    dlBtn.href = "javascript:void(0);";
    dlBtn.className = "md-bunkr-gallery-btn";
    dlBtn.title = "Download Gallery";
    dlBtn.innerHTML = dlIconSvg + `Download (${items.length})`;

    let activeJobId = "";
    dlBtn.addEventListener("click", async () => {
      if (activeJobId) return;
      activeJobId = "loading";
      activeJobId = await triggerDownload(
        dlBtn,
        loadingIconSvg,
        dlIconSvg + `Download (${items.length})`,
      );
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data as Record<string, unknown>;
      if (data["type"] === "MD_JOB_PROGRESS" && data["jobId"] === activeJobId) {
        const status = data["status"];
        if (status === "done" || status === "error") {
          dlBtn.innerHTML = dlIconSvg + `Download (${items.length})`;
          dlBtn.classList.remove("loading");
          activeJobId = "";
        }
      }
    });

    if (toggleBtn) {
      tools.insertBefore(dlBtn, toggleBtn);
    } else {
      tools.appendChild(dlBtn);
    }
    return;
  }

  const wrap = createDownloadAllButton(items.length, note, async () => {
    const btn = wrap.querySelector("button");
    if (btn) {
      btn.textContent = "Fetching pages...";
      const otherPageUrls = collectPageUrls();
      let jobItems = items.slice();
      if (otherPageUrls.length > 0) {
        const extra = await fetchAdditionalItems(otherPageUrls, gc);
        jobItems.push(...extra);
        const seen = new Set<string>();
        jobItems = jobItems.filter((item) => {
          const key = item.kind === "resolve-viewer" ? item.viewerUrl : item.imageUrl;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      btn.textContent = "Queued…";
      const req: MDGalleryStartRequest = {
        type: "MD_GALLERY_START",
        jobId: crypto.randomUUID(),
        hosterId: model.id,
        subfolder,
        items: jobItems,
        maxParallel: config.maxParallel,
      };
      window.postMessage(req, "*");
    }
  });

  // Inject the button before the gallery content.
  // Try a few common gallery container selectors; fall back to document.body.
  const container =
    document.querySelector("#container, .gallery, [class*='gallery'], main, article") ??
    document.body;
  container.prepend(wrap);

  // Update button label to show album name if we found one.
  const btn = wrap.querySelector("button");
  if (btn && albumName !== albumId) {
    btn.textContent = `⬇ Download "${albumName}" (${items.length})`;
  }
}
