import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import { resolveFilename } from "../../content/shared/filename";
import { wireButton } from "../../content/shared/wire";
import {
  injectGalleryStyles,
  injectHosterStyles,
  wireGalleryButton,
  type GalleryCtx,
} from "../../content/shared/gallery-ui";

export function activate(model: HosterModel, config: MDConfig): void {
  const cfg = model.downloadConfig;
  const icon = document.querySelector(cfg.buttonSelector);
  const button = icon?.closest<HTMLAnchorElement>("a");
  if (!button) return;

  const image = cfg.imageSelector
    ? document.querySelector<HTMLImageElement>(cfg.imageSelector)
    : null;
  const url = image?.src || button.href;
  if (!url) return;

  wireButton(button, url, () => resolveFilename(cfg.filenameStrategy), config, model);
}

export function activateGallery(_model: HosterModel, ctx: GalleryCtx): void {
  const albumHeader = document.querySelector("h1");
  if (!albumHeader) return;

  injectGalleryStyles();
  injectHosterStyles(
    "imgbox",
    `
    .md-imgbox-gallery-btn {
      cursor: pointer;
    }
    .md-imgbox-gallery-btn.loading {
      pointer-events: none;
    }
  `,
  );

  const dlIcon = '<i class="icon-cloud-download"></i>';
  const loadingIcon =
    '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="display: inline-block; vertical-align: middle; animation: md-spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="currentColor" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>';

  const dlBtn = document.createElement("a");
  dlBtn.href = "javascript:void(0);";
  dlBtn.className = "btn btn-inverse md-imgbox-gallery-btn";
  dlBtn.title = "Download Gallery";
  dlBtn.innerHTML = dlIcon;

  wireGalleryButton(dlBtn, loadingIcon, dlIcon, ctx.triggerDownload);

  albumHeader.appendChild(dlBtn);
  if (albumHeader instanceof HTMLElement) {
    albumHeader.style.display = "flex";
    albumHeader.style.justifyContent = "space-between";
    albumHeader.style.alignItems = "center";
  }
}
