import { request } from "./bridge";

// MAIN world. Ask the bridge for the bytes, wrap them in a Blob, and trigger a
// same-origin object-URL download — no chrome.downloads permission needed.
export async function downloadBlob(url: string, filename: string): Promise<void> {
  const result = await request(url);
  if ("error" in result) throw new Error(result.error);

  const blob = new Blob([result.buffer], { type: result.contentType });
  const href = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), { href, download: filename });
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 100);
}
