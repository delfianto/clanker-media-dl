import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import { resolveFilename } from "../../content/shared/filename";
import { wireButton } from "../../content/shared/wire";
import { createDownloadAllButton, type GalleryCtx } from "../../content/shared/gallery-ui";

export function activate(model: HosterModel, config: MDConfig): void {
  const cfg = model.downloadConfig;
  const button = document.querySelector<HTMLAnchorElement>(cfg.buttonSelector);
  if (!button) return;

  const url = button.href;
  if (!url) return;

  wireButton(button, url, () => resolveFilename(cfg.filenameStrategy), config, model);
}

export function activateGallery(_model: HosterModel, ctx: GalleryCtx): void {
  const note =
    ctx.items.length > 0 && ctx.items[0]?.kind === "resolve-viewer"
      ? undefined
      : "Current page only — pagination not yet supported";

  const wrap = createDownloadAllButton(ctx.items.length, note, async () => {
    const btn = wrap.querySelector("button");
    if (btn) {
      btn.textContent = "Queued…";
      await ctx.triggerDownload(btn, "⏳", "⬇");
    }
  });

  const container =
    document.querySelector("#container, .gallery, [class*='gallery'], main, article") ??
    document.body;
  container.prepend(wrap);

  const btn = wrap.querySelector("button");
  if (btn && ctx.albumName) {
    btn.textContent = `⬇ Download "${ctx.albumName}" (${ctx.items.length})`;
  }
}
