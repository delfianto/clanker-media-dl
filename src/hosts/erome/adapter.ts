import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import {
  injectGalleryStyles,
  injectHosterStyles,
  wireGalleryButton,
  type GalleryCtx,
} from "../../content/shared/gallery-ui";

export function activate(_model: HosterModel, _config: MDConfig): void {
  // Erome does not have single-image viewer pages that we run on.
}

export function activateGallery(_model: HosterModel, ctx: GalleryCtx): void {
  const usernameSection = document.querySelector(".user-profile.page-content .username");
  const fallback = document.querySelector(".album-title-page");
  if (!usernameSection && !fallback) return;

  injectGalleryStyles();
  injectHosterStyles(
    "erome",
    `
    .md-erome-gallery-btn {
      margin: 0 8px;
    }
    .md-erome-gallery-btn.loading {
      pointer-events: none;
      opacity: 0.7;
    }
    `,
  );

  const dlIconSvg =
    '<svg class="svg-fa" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const loadingIconSvg =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="display: inline-block; vertical-align: middle; animation: md-spin 1s linear infinite; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="currentColor" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>';
  const doneLabel = dlIconSvg + `Download (${ctx.items.length})`;

  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "btn btn-pink md-erome-gallery-btn";
  dlBtn.title = "Download Gallery";
  dlBtn.innerHTML = doneLabel;

  wireGalleryButton(dlBtn, loadingIconSvg, doneLabel, ctx.triggerDownload);

  if (usernameSection) {
    const followBtn = usernameSection.querySelector("button.btn-pink");
    if (followBtn) {
      usernameSection.insertBefore(dlBtn, followBtn);
    } else {
      usernameSection.appendChild(dlBtn);
    }
  } else if (fallback) {
    fallback.appendChild(dlBtn);
  }
}
