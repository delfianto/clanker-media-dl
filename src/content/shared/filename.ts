import type { FilenameStrategy } from "../../types/hoster";

// NB: no `g` flag — a global regex makes .test() stateful (alternating
// true/false across calls), which is the latent bug in the original userscript.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const V1_RE = /^[a-f0-9]{5,6}(\d+)$/;

function readDom(selector: string, attr?: string): string {
  const el = document.querySelector(selector);
  if (!el) return "";
  if (attr) return el.getAttribute(attr) ?? "";
  return (el.textContent ?? "").trim();
}

function urlSlug(): string {
  return location.pathname.split("/").filter(Boolean).at(-1) ?? "";
}

// Pure function: given a filename and a file ID (from URL), return the file ID
// as the name (preserving extension) when the filename's base is a UUID.
// Exported for unit testing.
export function resolveUuidFallback(origName: string, fileId: string): string {
  const dot = origName.lastIndexOf(".");
  const base = dot >= 0 ? origName.slice(0, dot) : origName;
  const ext = dot >= 0 ? origName.slice(dot + 1) : "";
  if (!UUID_RE.test(base)) return origName;

  const newName = V1_RE.exec(fileId)?.[1] ?? fileId;
  return ext ? `${newName}.${ext}` : newName;
}

// Resolve the download filename from a hoster's FilenameStrategy.
export function resolveFilename(strategy: FilenameStrategy): string {
  switch (strategy.type) {
    case "dom":
      return readDom(strategy.selector, strategy.attr);

    case "url-slug":
      return urlSlug();

    case "uuid-fallback": {
      const origName = readDom(strategy.domSelector);
      return resolveUuidFallback(origName, urlSlug());
    }
  }
}
