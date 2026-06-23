import type { HosterModel } from "../../types/hoster";
import { createInlineUI } from "../../content/shared/ui";
import { resolveFilename } from "../../content/shared/filename";
import { wireButton } from "../../content/shared/wire";

export function activate(model: HosterModel): void {
  const cfg = model.downloadConfig;
  const button = document.querySelector<HTMLAnchorElement>(cfg.buttonSelector);
  if (!button) return;

  // Prefer the displayed image's src (already in the page cache) over the
  // button href, matching the original userscript's cache-hit behaviour.
  const image = cfg.imageSelector
    ? document.querySelector<HTMLImageElement>(cfg.imageSelector)
    : null;
  const url = image?.src || button.href;
  if (!url) return;

  const anchor = document.querySelector<HTMLElement>("span.name.text-ellipsis") ?? button;
  const ui = createInlineUI(anchor);
  wireButton(button, url, () => resolveFilename(cfg.filenameStrategy), ui);
}
