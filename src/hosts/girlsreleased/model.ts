import type { GalleryJobItem } from "../../types/messages";
import type { HosterModel } from "../../types/hoster";

function collectGirlsreleasedItems(root?: Document | Element): GalleryJobItem[] {
  const scope = root ?? document;

  const anchors = Array.from(scope.querySelectorAll<HTMLAnchorElement>("a"));
  const items: GalleryJobItem[] = [];
  const visited = new Set<string>();

  const titleNode = scope.querySelector("h1") || document.querySelector("title");
  const albumName = titleNode?.textContent?.trim() || "girlsreleased";
  const normalizedAlbumName = albumName
    .replace(/\s+/g, "_")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  let idx = 0;
  for (const anchor of anchors) {
    const href = anchor.href;
    if (!href) continue;

    const isSupportedHost = href.includes("imx.to/i/");
    if (isSupportedHost && !visited.has(href)) {
      visited.add(href);
      idx++;
      const num = String(idx).padStart(3, "0");
      const filename = `${normalizedAlbumName}_${num}`;

      items.push({
        kind: "resolve-viewer",
        viewerUrl: href,
        extractor: "continuebutton",
        filename,
      });
    }
  }

  console.log(`[md] GirlsReleased: found ${items.length} items from viewer links`);
  return items;
}

async function resolveGirlsreleasedUrl(rawUrl: string, viewerUrl?: string): Promise<string> {
  if (!viewerUrl) return rawUrl;

  if (viewerUrl.includes("imx.to/i/")) {
    const payload = new URLSearchParams();
    payload.append("imgContinue", "Continue to your image...");

    const res = await fetch(viewerUrl, {
      method: "POST",
      body: payload,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to POST to imx.to! HTTP ${res.status}`);
    }

    const html = await res.text();
    const imgMatch = html.match(/<img[^>]+src=["'](https:\/\/[^"']+\.(?:jpg|jpeg|png))["']/i);
    if (!imgMatch?.[1]) {
      throw new Error("Failed to parse direct image URL from imx.to POST response");
    }
    return imgMatch[1];
  }

  return rawUrl;
}

export const girlsreleasedModel: HosterModel = {
  id: "girlsreleased",
  displayName: "GirlsReleased",
  viewerMatches: [],
  cdnMatches: [],
  defaultRedirectRules: [],
  downloadConfig: {
    buttonSelector: "",
    filenameStrategy: { type: "url-slug" },
    uiMode: "button-overlay",
  },
  defaultCssOverrides: "",
  galleryConfig: {
    galleryMatches: ["https://girlsreleased.com/set/*"],
    albumNameSelector: "h1",
    albumIdFromPath: "^/set/([^/?]+)",
    imageSource: {
      strategy: "anchor-href",
      imageSelector: "#root img",
    },
    collectAllItems: collectGirlsreleasedItems,
    resolveUrl: resolveGirlsreleasedUrl,
  },
  getGalleryName: (doc: Document) => {
    const h1 = doc.querySelector("h1");
    if (h1) return h1.textContent?.trim() ?? null;
    return doc.title?.trim() ?? null;
  },
};
