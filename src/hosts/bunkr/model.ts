import type { GalleryJobItem } from "../../types/messages";
import type { HosterModel } from "../../types/hoster";

// Bunkr embeds the complete file list as a JS variable (window.albumFiles) in
// every album page. The DOM only renders a subset at any time (pagination /
// advanced view), so we read this variable directly from MAIN world to get the
// full list. Falls back to DOM-scraping if the variable is missing.

// Comprehensive domain list — sourced from gallery-dl + known mirrors.
// Keep sorted alphabetically. Used to generate viewerMatches, galleryMatches,
// and vite.config.ts content_scripts / host_permissions.
export const BUNKR_DOMAINS = [
  "bunkr.ac",
  "bunkr.black",
  "bunkr.cat",
  "bunkr.ci",
  "bunkr.cr",
  "bunkr.fi",
  "bunkr.is",
  "bunkr.la",
  "bunkr.media",
  "bunkr.org",
  "bunkr.ph",
  "bunkr.pk",
  "bunkr.ps",
  "bunkr.red",
  "bunkr.ru",
  "bunkr.si",
  "bunkr.site",
  "bunkr.sk",
  "bunkr.su",
  "bunkr.to",
  "bunkr.ws",
] as const;

interface BunkrFile {
  slug: string;
  name: string;
  [key: string]: unknown;
}

function collectBunkrItems(): GalleryJobItem[] {
  const origin = location.origin;
  const extractor = 'var jsCDN\\s*=\\s*"([^"]+)"';

  // Strategy 1: read window.albumFiles (JS variable set by Bunkr's script)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const albumFiles = (window as any).albumFiles as BunkrFile[] | undefined;
  if (Array.isArray(albumFiles) && albumFiles.length > 0) {
    console.log(`[md] Bunkr: found ${albumFiles.length} items in window.albumFiles`);
    return albumFiles
      .filter((f) => f.slug)
      .map((f) => ({
        kind: "resolve-viewer" as const,
        viewerUrl: `${origin}/f/${f.slug}`,
        extractor,
        filename: f.name || f.slug,
        needsSign: true as const,
      }));
  }

  // Strategy 2: parse <script> tags for embedded JSON arrays with slug data.
  // Bunkr sometimes embeds file data as a JSON array in inline scripts.
  const scripts = document.querySelectorAll<HTMLScriptElement>("script:not([src])");
  for (const script of scripts) {
    const text = script.textContent ?? "";
    // Look for a JSON array assigned to any variable, containing objects with "slug" keys
    const arrayMatch = /=\s*(\[\s*\{[^]*?\}\s*\])\s*;/.exec(text);
    if (!arrayMatch?.[1]) continue;
    try {
      const parsed = JSON.parse(arrayMatch[1]) as unknown[];
      const files = parsed.filter(
        (f): f is BunkrFile =>
          typeof f === "object" && f !== null && typeof (f as BunkrFile).slug === "string",
      );
      if (files.length > 0) {
        console.log(`[md] Bunkr: found ${files.length} items in inline <script> JSON`);
        return files.map((f) => ({
          kind: "resolve-viewer" as const,
          viewerUrl: `${origin}/f/${f.slug}`,
          extractor,
          filename: f.name || f.slug,
          needsSign: true as const,
        }));
      }
    } catch {
      // Not valid JSON — try next script
    }
  }

  // Strategy 3: scrape all /f/ anchors currently in the DOM
  console.log("[md] Bunkr: no JS data source found, falling back to DOM scraping");
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/f/']"));
  return anchors
    .filter((a) => !!a.href)
    .map((a) => {
      const viewerUrl = a.href;
      // Try to find a filename from a child element with class "name" or "text-ellipsis"
      const nameEl = a.querySelector(".name, .text-ellipsis, [class*='name']");
      const filename = nameEl?.textContent?.trim() || viewerUrl.split("/").at(-1) || "file";
      return {
        kind: "resolve-viewer" as const,
        viewerUrl,
        extractor,
        filename,
        needsSign: true as const,
      };
    });
}

export const bunkrModel: HosterModel = {
  id: "bunkr",
  displayName: "Bunkr",
  viewerMatches: BUNKR_DOMAINS.map((d) => `https://${d}/f/*`),
  cdnMatches: [],
  defaultRedirectRules: [],
  downloadConfig: {
    // The "Download" CTA on the viewer page — we hijack its click to bypass the dl.bunkr hop.
    buttonSelector: "a.btn-main.ic-download-01",
    // Page JS signs jsCDN async and sets this src; we read it at click time, not activate time.
    imageSelector: "#img-main",
    filenameStrategy: { type: "dom", selector: "h1" },
    uiMode: "button-overlay",
  },
  defaultCssOverrides: "",
  galleryConfig: {
    galleryMatches: BUNKR_DOMAINS.map((d) => `https://${d}/a/*`),
    albumNameSelector: "h1",
    albumIdFromPath: "^/a/([^/?]+)",
    imageSource: {
      strategy: "resolve-viewer",
      // Album grid: <a href="/f/{fileId}">...</a> links to the file viewer page.
      // SW fetches each viewer HTML; group 1 = jsCDN (unsigned CDN URL).
      anchorSelector: "a[href*='/f/']",
      extractor: 'var jsCDN\\s*=\\s*"([^"]+)"',
      needsSign: true,
    },
    // Reads window.albumFiles (complete file list) instead of DOM-scraping,
    // which only returns a subset due to Bunkr's JS-driven pagination.
    collectAllItems: collectBunkrItems,
  },
};
