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
  const button = document.querySelector<HTMLAnchorElement>(cfg.buttonSelector);
  if (!button) return;

  const url = button.href;
  if (!url) return;

  wireButton(button, url, () => resolveFilename(cfg.filenameStrategy), config, model);
}

export function activateGallery(_model: HosterModel, ctx: GalleryCtx): void {
  const headerRight = document.querySelector(".header-content-right");
  if (!headerRight) return;

  injectGalleryStyles();
  injectHosterStyles(
    "jpg6",
    `
    .md-jpg6-gallery-btn.loading {
      pointer-events: none;
      opacity: 0.6;
    }
  `,
  );

  const dlIcon =
    '<span class="btn-icon fas fa-download"></span><span class="btn-text phone-hide">Download</span>';
  // Self-contained md-spin SVG: jpg6 ships a bundled FontAwesome that doesn't
  // always load `fa-spin`, leaving `fa-circle-notch fa-spin` static. Inline
  // SVG with our own keyframe animates reliably.
  const loadingIcon =
    '<span class="btn-icon"><svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="display: inline-block; vertical-align: middle; animation: md-spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="currentColor" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg></span><span class="btn-text phone-hide">Download</span>';

  const dlBtn = document.createElement("a");
  dlBtn.href = "javascript:void(0);";
  dlBtn.className = "btn green md-jpg6-gallery-btn";
  dlBtn.title = "Download Gallery";
  dlBtn.innerHTML = dlIcon;

  wireGalleryButton(dlBtn, loadingIcon, dlIcon, ctx.triggerDownload);
  headerRight.prepend(dlBtn);
}
