import type { HosterModel } from "../../types/hoster";
import { createIconSwapUI } from "../../content/shared/ui";
import { resolveFilename } from "../../content/shared/filename";
import { wireButton } from "../../content/shared/wire";

export function activate(model: HosterModel): void {
  const cfg = model.downloadConfig;

  // The dropdown-item[target="_blank"] is the download link; its href is the
  // same CDN URL as img.main-image src, so either source works.
  const downloadAnchor = document.querySelector<HTMLAnchorElement>(cfg.buttonSelector);
  if (!downloadAnchor) return;

  const image = cfg.imageSelector
    ? document.querySelector<HTMLImageElement>(cfg.imageSelector)
    : null;
  const url = image?.src || downloadAnchor.href;
  if (!url) return;

  // FA 5 is already loaded on the page, so we can use its classes directly.
  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "md-icon-btn";
  dlBtn.title = "Download";
  dlBtn.innerHTML = '<i class="fas fa-download"></i>';

  // Trigger imagebam's native share modal instead of rolling our own.
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

  // Hide the entire .view-switches block (the three-dot trigger + its menu)
  // and drop our two icon buttons in its place, as siblings inside .header-top.
  const viewSwitches = downloadAnchor.closest<HTMLElement>(".view-switches");
  if (viewSwitches) {
    viewSwitches.after(group);
    viewSwitches.style.display = "none";
  } else {
    downloadAnchor.after(group);
    downloadAnchor.style.display = "none";
  }

  wireButton(dlBtn, url, () => resolveFilename(cfg.filenameStrategy), createIconSwapUI(dlBtn));
}
