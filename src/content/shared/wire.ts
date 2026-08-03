import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import { injectSpinnerStyles } from "./ui";
import { downloadBlob } from "./downloader";

// Self-contained inline SVG spinner. Relies on the inline `animation: md-spin
// 1s linear infinite` style + the @keyframes md-spin rule from
// injectSpinnerStyles() — never depends on hoster CSS (FontAwesome, icon-spin,
// etc.), so it animates everywhere from ibb.co to imagebam to jpg6.
const SPINNER_HTML =
  '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="display: inline-block; vertical-align: middle; animation: md-spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="currentColor" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>';

export function wireButton(
  button: HTMLElement,
  url: string,
  filename: () => string,
  config?: MDConfig,
  model?: HosterModel,
): void {
  // Ensure the @keyframes md-spin rule is defined so SPINNER_HTML actually
  // animates on viewer pages (imgbox/imgbb/jpg6) that don't load the gallery
  // styles. Idempotent — already-present styles are skipped.
  injectSpinnerStyles();
  button.removeAttribute("target");
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    // Reentrancy guard: ignore clicks while a download is already in flight.
    if (button.dataset["mdLoading"] === "1") return;
    button.dataset["mdLoading"] = "1";
    button.style.pointerEvents = "none";
    button.style.opacity = "0.65";
    // Preserve the hoster's original button content so it can be restored
    // after the download resolves (success or error).
    const original = button.innerHTML;
    button.innerHTML = SPINNER_HTML;
    try {
      await downloadBlob(url, filename() || "download", config, model);
    } finally {
      button.innerHTML = original;
      button.style.pointerEvents = "";
      button.style.opacity = "";
      delete button.dataset["mdLoading"];
    }
  });
}
