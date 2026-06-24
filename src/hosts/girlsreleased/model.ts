import type { GalleryJobItem } from "../../types/messages";
import type { HosterModel, CrawlResult } from "../../types/hoster";
import type { MDConfig } from "../../types/global";
import { resolveLeaf, thumbnailToFull } from "../../resolvers/index";
import { parseSet, deriveGalleryName, compareSetsByDateAndSubfolder } from "./api";
import { buildSubfolder } from "../../content/shared/collector";

function collectGirlsreleasedItems(root?: Document | Element): GalleryJobItem[] {
  const isSitePage =
    !root && typeof window !== "undefined" && window.location.pathname.includes("/site/");

  if (isSitePage) {
    // isSitePage implies !root, so the scope is always the live document.
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a"));
    const items: GalleryJobItem[] = [];
    const visited = new Set<string>();

    for (const anchor of anchors) {
      const href = anchor.href;
      if (!href) continue;

      const isSetLink = /\/set\/[^/?]+/.test(href);
      if (isSetLink && !visited.has(href)) {
        visited.add(href);
        items.push({
          kind: "resolve-viewer",
          viewerUrl: href,
          filename: "set_placeholder",
        });
      }
    }
    console.log(`[md] GirlsReleased: found ${items.length} set pages to crawl`);
    return items;
  }

  // Direct set page — emit a single self-referential item to trigger set expansion
  const urlToUse = !root ? window.location.href : "";
  if (urlToUse && urlToUse.includes("/set/")) {
    return [
      {
        kind: "resolve-viewer",
        viewerUrl: urlToUse,
        filename: "set_placeholder",
      },
    ];
  }

  return [];
}

// ── Crawl hook ───────────────────────────────────────────────────────────────
// All girlsreleased-specific crawl knowledge lives here, not in the shared
// gallery runner. The shared runner calls isCrawlItem to detect crawl items,
// crawlItem to expand each one, and sortCrawlResults to order the results.

function isGirlsreleasedSetItem(item: GalleryJobItem): boolean {
  return item.kind === "resolve-viewer" && item.viewerUrl.includes("/set/");
}

async function crawlGirlsreleasedSet(
  item: GalleryJobItem,
  model: HosterModel,
  config: MDConfig,
): Promise<CrawlResult | null> {
  if (item.kind !== "resolve-viewer") return null;

  const setIdMatch = /\/set\/(\d+)/.exec(item.viewerUrl);
  const setId = setIdMatch?.[1];
  if (!setId) return null;

  const res = await fetch(`/api/0.2/set/${setId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const parsed = parseSet(data);
  if (!parsed) return null;

  const detectedSetName = deriveGalleryName(
    parsed.site,
    parsed.model,
    parsed.name,
    parsed.postedAt,
  );
  const setSubfolder = detectedSetName ? buildSubfolder(detectedSetName, config) : "";

  const resolvedFiles: GalleryJobItem[] = [];
  for (const file of parsed.files) {
    const fullUrl = thumbnailToFull(file.thumbnailUrl);
    if (fullUrl) {
      resolvedFiles.push({
        kind: "resolved",
        imageUrl: fullUrl,
        filename: file.filename,
        subfolder: setSubfolder,
      });
    } else {
      resolvedFiles.push({
        kind: "resolve-viewer",
        viewerUrl: file.viewerUrl,
        filename: file.filename,
        subfolder: setSubfolder,
      });
    }
  }

  if (resolvedFiles.length === 0) return null;

  const setJobId = crypto.randomUUID();
  return {
    req: {
      type: "MD_GALLERY_START",
      jobId: setJobId,
      hosterId: model.id,
      subfolder: setSubfolder,
      items: resolvedFiles,
      maxParallelImg: config.maxParallelImg,
      maxParallelVid: config.maxParallelVid,
      postedAt: parsed.postedAt ?? undefined,
    },
    postedAt: parsed.postedAt ?? 0,
  };
}

function sortGirlsreleasedSets(a: CrawlResult, b: CrawlResult): number {
  return compareSetsByDateAndSubfolder(
    { postedAt: a.postedAt, subfolder: a.req.subfolder },
    { postedAt: b.postedAt, subfolder: b.req.subfolder },
  );
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
    galleryMatches: [
      "https://girlsreleased.com/set/*",
      "https://*.girlsreleased.com/set/*",
      "https://girlsreleased.com/site/*",
      "https://*.girlsreleased.com/site/*",
    ],
    albumNameSelector: "h1",
    albumIdFromPath: "^/(?:set|site)/([^/?]+)",
    waitForSelector: "a[href*='imx.to/i/'], a[href*='/set/']",
    imageSource: {
      strategy: "anchor-href",
      imageSelector: "#root img",
    },
    collectAllItems: collectGirlsreleasedItems,
    resolveFromViewer: resolveLeaf,
    crawlConfig: {
      isCrawlItem: isGirlsreleasedSetItem,
      crawlItem: crawlGirlsreleasedSet,
      sortCrawlResults: sortGirlsreleasedSets,
      crawlConcurrency: 8,
    },
  },
  hostPermissions: [
    "https://girlsreleased.com/*",
    "https://*.girlsreleased.com/*",
    "https://*.imx.to/*",
    "https://www.imagevenue.com/*",
    "https://*.imagevenue.com/*",
  ],
  getGalleryName: async (doc: Document) => {
    // 1. Find the visible h1 (the set name)
    const visibleH1 = Array.from(doc.querySelectorAll("h1")).find((el) => {
      const style = el.getAttribute("style") || "";
      const text = el.textContent?.trim() || "";
      return !style.includes("display: none") && text !== "about 0";
    });
    const setName = visibleH1 ? visibleH1.textContent?.trim() || "" : doc.title?.trim() || "";

    // 2. Find site links that are not in navigation/header
    const siteLinks = Array.from(
      doc.querySelectorAll<HTMLAnchorElement>('a[href*="/site/"]'),
    ).filter((a) => !a.closest("nav") && !a.closest("header"));

    const siteLink = siteLinks.find((a) => {
      const href = a.getAttribute("href") || "";
      return href.startsWith("/site/") && !href.includes("/model/");
    });
    const modelLink = siteLinks.find((a) => {
      const href = a.getAttribute("href") || "";
      return href.startsWith("/site/") && href.includes("/model/");
    });

    let siteName = "";
    if (siteLink) {
      const text = siteLink.textContent?.trim() || "";
      const href = siteLink.getAttribute("href") || "";
      const match = /\/site\/([^/?]+)/.exec(href);
      const rawSite = match?.[1] || text;
      siteName = rawSite;
    }

    let modelName = "";
    if (modelLink) {
      modelName = modelLink.textContent?.trim() || "";
    }

    return deriveGalleryName(siteName, modelName, setName) || null;
  },
};
