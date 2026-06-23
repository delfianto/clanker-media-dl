import type { HosterModel } from "../../types/hoster";
import { createButtonUI } from "../../content/shared/ui";
import { resolveFilename } from "../../content/shared/filename";
import { wireButton } from "../../content/shared/wire";

export function activate(model: HosterModel): void {
  const cfg = model.downloadConfig;
  const button = document.querySelector<HTMLAnchorElement>(cfg.buttonSelector);
  if (!button) return;

  // imgbb's button href is the full-res original on i.ibb.co — a different
  // resource from the displayed preview, so no cache hit is expected here.
  const url = button.href;
  if (!url) return;

  const ui = createButtonUI(button);
  wireButton(button, url, () => resolveFilename(cfg.filenameStrategy), ui);
}
