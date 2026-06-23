import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import {
  injectGalleryStyles,
  injectHosterStyles,
  wireGalleryButton,
  type GalleryCtx,
} from "../../content/shared/gallery-ui";

export function activate(_model: HosterModel, _config: MDConfig): void {
  // Viewer activation is not needed on girlsreleased.com itself
}

export function activateGallery(_model: HosterModel, ctx: GalleryCtx): void {
  const title = document.querySelector("h1");
  console.log("[md] activateGallery: document.querySelector('h1') =", title);
  if (!title) {
    console.error("[md] activateGallery: Failed to find h1 element!");
    return;
  }

  injectGalleryStyles();
  injectHosterStyles(
    "girlsreleased",
    `
    .md-girlsreleased-gallery-btn {
      margin-left: 12px;
      font-size: 14px;
      padding: 6px 12px;
      cursor: pointer;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: #f0f0f0;
      color: #333;
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
    }
    .md-girlsreleased-gallery-btn.loading {
      pointer-events: none;
      opacity: 0.6;
    }
    `,
  );

  const dlIcon =
    '<span class="btn-icon" style="margin-right: 4px;">📥</span> <span class="btn-text">Download Gallery</span>';
  const loadingIcon =
    '<span class="btn-icon" style="margin-right: 4px;">⏳</span> <span class="btn-text">Downloading...</span>';

  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "md-girlsreleased-gallery-btn";
  dlBtn.title = "Download Gallery";
  dlBtn.innerHTML = dlIcon;

  wireGalleryButton(dlBtn, loadingIcon, dlIcon, ctx.triggerDownload);
  title.after(dlBtn);
  console.log("[md] activateGallery: button appended to DOM after title, dlBtn:", dlBtn);
}
