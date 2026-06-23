import type { DownloadUI } from "./ui";
import { downloadBlob } from "./downloader";

// Hijack an existing download control: suppress its native navigation and run
// our cache-aware blob download instead, driving the feedback UI. filename is a
// thunk so it's read at click time, not at wire time.
export function wireButton(
  button: HTMLElement,
  url: string,
  filename: () => string,
  ui: DownloadUI,
): void {
  button.removeAttribute("target");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    ui.showSpinner();
    void downloadBlob(url, filename() || "download").then(
      () => ui.showSuccess(),
      (err: unknown) => ui.showError(err instanceof Error ? err.message : "Download failed"),
    );
  });
}
