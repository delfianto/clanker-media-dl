import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import { injectButtonStyles } from "../../content/shared/ui";
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

  const downloadAnchor = document.querySelector<HTMLAnchorElement>(cfg.buttonSelector);
  if (!downloadAnchor) return;

  const image = cfg.imageSelector
    ? document.querySelector<HTMLImageElement>(cfg.imageSelector)
    : null;
  const url = image?.src || downloadAnchor.href;
  if (!url) return;

  injectButtonStyles();

  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "md-icon-btn";
  dlBtn.title = "Download";
  dlBtn.innerHTML = '<i class="fas fa-download"></i>';

  const shareAnchor = document.querySelector<HTMLElement>(
    'a.dropdown-item[data-target="#modal-share-image"]',
  );
  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "md-icon-btn";
  shareBtn.title = "Share";
  shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
  shareBtn.addEventListener("click", () => {
    shareAnchor?.click();
  });

  const group = document.createElement("div");
  group.className = "md-icon-group";
  group.append(dlBtn, shareBtn);

  const viewSwitches = downloadAnchor.closest<HTMLElement>(".view-switches");
  if (viewSwitches) {
    viewSwitches.after(group);
    viewSwitches.style.display = "none";
  } else {
    downloadAnchor.after(group);
    downloadAnchor.style.display = "none";
  }

  wireButton(dlBtn, url, () => resolveFilename(cfg.filenameStrategy), config, model);
}

export function activateGallery(_model: HosterModel, ctx: GalleryCtx): void {
  const viewSwitches = document.querySelector(".view-switches");
  if (!viewSwitches) return;

  injectGalleryStyles();
  injectHosterStyles(
    "imagebam",
    `
    .main-content .view-switches a.md-ib-gallery-btn {
      position: relative;
      top: -0.05em;
      cursor: pointer;
      margin-right: 12px;
      opacity: 0.6;
      font-size: 0.9em;
      transition: opacity 0.15s;
    }
    .main-content .view-switches a.md-ib-gallery-btn:hover {
      opacity: 1;
    }
    .main-content .view-switches a.md-ib-gallery-btn.loading {
      pointer-events: none;
      opacity: 1;
    }
  `,
  );

  const dlBtn = document.createElement("a");
  dlBtn.href = "javascript:void(0);";
  dlBtn.className = "md-ib-gallery-btn";
  dlBtn.title = "Download Gallery";
  const dlIcon = '<i class="fa fa-download"></i>';
  const loadingIcon = '<i class="fa fa-spinner fa-spin"></i> ';
  dlBtn.innerHTML = dlIcon;

  wireGalleryButton(dlBtn, loadingIcon, dlIcon, ctx.triggerDownload);
  viewSwitches.prepend(dlBtn);
}
