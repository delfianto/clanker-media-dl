import { downloadBlob } from "./downloader";

export function wireButton(button: HTMLElement, url: string, filename: () => string): void {
  button.removeAttribute("target");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    void downloadBlob(url, filename() || "download");
  });
}
