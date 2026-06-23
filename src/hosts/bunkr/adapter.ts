import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import { resolveFilename } from "../../content/shared/filename";
import { downloadBlob } from "../../content/shared/downloader";
import {
  injectGalleryStyles,
  injectHosterStyles,
  wireGalleryButton,
  type GalleryCtx,
} from "../../content/shared/gallery-ui";

export function activate(model: HosterModel, config: MDConfig): void {
  const cfg = model.downloadConfig;
  const button = document.querySelector<HTMLAnchorElement>(cfg.buttonSelector);
  if (!button) return;

  button.removeAttribute("target");
  button.addEventListener("click", (event) => {
    event.preventDefault();

    // Read the signed CDN URL at click time: page JS sets #img-main.src (for images)
    // or creates #player source (for videos) asynchronously via glb-apisign.cdn.cr/sign.
    // By click time the media is loaded, so the URL is always ready.
    const img = cfg.imageSelector
      ? document.querySelector<HTMLImageElement>(cfg.imageSelector)
      : null;
    let url = img?.src;
    if (!url) {
      const source = document.querySelector<HTMLSourceElement>("#player source");
      url = source?.src;
    }
    if (!url?.startsWith("http")) return;

    void downloadBlob(url, resolveFilename(cfg.filenameStrategy) || "download", config, model);
  });
}

export function activateGallery(_model: HosterModel, ctx: GalleryCtx): void {
  const tools = document.querySelector(".album-toolbar .left-tools");
  if (!tools) return;

  injectGalleryStyles();
  injectHosterStyles(
    "bunkr",
    `
    .md-bunkr-gallery-btn {
      height: 2.25rem;
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0 0.9rem; font-size: 0.9rem; font-weight: 600;
      border: 1px solid rgba(167, 139, 250, 0.35); border-radius: 9999px;
      color: #c9b8ff !important; background: transparent; cursor: pointer;
      text-decoration: none !important; transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .md-bunkr-gallery-btn:hover {
      background: rgba(167, 139, 250, 0.1); border-color: #a78bfa; color: #fff !important;
    }
    .md-bunkr-gallery-btn.loading {
      pointer-events: none; opacity: 0.7;
    }
  `,
  );

  const dlIconSvg =
    '<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const loadingIconSvg =
    '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="display: inline-block; vertical-align: middle; animation: md-spin 1s linear infinite; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="currentColor" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>';
  const doneLabel = dlIconSvg + `Download (${ctx.items.length})`;

  const dlBtn = document.createElement("a");
  dlBtn.href = "javascript:void(0);";
  dlBtn.className = "md-bunkr-gallery-btn";
  dlBtn.title = "Download Gallery";
  dlBtn.innerHTML = doneLabel;

  wireGalleryButton(dlBtn, loadingIconSvg, doneLabel, ctx.triggerDownload);

  const toggleBtn = tools.querySelector(".mode-toggle-btn");
  if (toggleBtn) {
    tools.insertBefore(dlBtn, toggleBtn);
  } else {
    tools.appendChild(dlBtn);
  }
}
