import type { GalleryJobItem } from "../../types/messages";
import type { HosterModel, CrawlResult } from "../../types/hoster";
import type { MDConfig } from "../../types/global";
import { resolveLeaf, thumbnailToFull } from "../../resolvers/index";
import { parseSet, deriveGalleryName, compareSetsByDateAndSubfolder } from "./api";
import { buildSubfolder } from "../../content/shared/collector";

function collectSetAnchorsFromRoot(root: Document | Element): GalleryJobItem[] {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a"));
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
  return items;
}

// Extract SPA authentication token from localStorage to crawl logged-in sites.
function grAuthHeaders(): Record<string, string> {
  try {
    if (typeof localStorage === "undefined") return {};
    const token = localStorage.getItem("accessToken");
    return token ? { "x-token": token } : {};
  } catch {
    return {};
  }
}

// Fetch listing page with exponential backoff for transient failures to prevent crawl truncation.
async function fetchSetsPage(url: string, maxRetries = 3): Promise<{ sets?: unknown[] } | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: grAuthHeaders(), credentials: "include" });
      if (res.ok) return (await res.json()) as { sets?: unknown[] };
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        console.warn(`[md] GirlsReleased: API ${url} returned HTTP ${res.status}, giving up`);
        return null;
      }
    } catch (err) {
      if (attempt >= maxRetries) {
        console.warn(`[md] GirlsReleased: API ${url} failed after ${maxRetries} retries:`, err);
        return null;
      }
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

// Paginate the API (up to 100 deduplicated sets per page) to bypass the SPA's infinite scroll limits.
async function collectAllSetsViaApi(site: string, modelId?: string): Promise<GalleryJobItem[]> {
  const base = modelId
    ? `/api/0.3/sets/site/${encodeURIComponent(site)}/model/${encodeURIComponent(modelId)}/sort/date/page/`
    : `/api/0.3/sets/site/${encodeURIComponent(site)}/sort/date/page/`;

  const items: GalleryJobItem[] = [];
  const seenIds = new Set<number>();
  const MAX_PAGES = 200; // safety cap against runaway pagination

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchSetsPage(`${base}${page}`);
    if (!data) break; // unreachable even after retries — stop, but keep what we have

    const sets = data.sets;
    if (!Array.isArray(sets) || sets.length === 0) break;

    for (const entry of sets) {
      if (!Array.isArray(entry)) continue;
      const rawId = entry[0];
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id) || seenIds.has(id)) continue;
      seenIds.add(id);
      items.push({
        kind: "resolve-viewer",
        viewerUrl: `https://girlsreleased.com/set/${id}`,
        filename: "set_placeholder",
      });
    }

    if (sets.length <= 100) break; // last page
  }

  console.log(`[md] GirlsReleased: discovered ${items.length} sets via API pagination for ${site}`);
  return items;
}

async function collectGirlsreleasedItems(root?: Document | Element): Promise<GalleryJobItem[]> {
  // Root-provided path: HTML-pagination fallback (used by fetchAdditionalItems
  // when collectPageUrls finds real pagination links). The girlsreleased SPA
  // drives pagination via a JS "Load More" button rather than real <a href>
  // links, so this path is rarely hit in practice — but kept for safety.
  if (root) {
    return collectSetAnchorsFromRoot(root);
  }

  if (typeof window === "undefined") return [];

  const path = window.location.pathname;

  // /site/{site}[/model/{id}/{name}] — paginate the API to discover ALL sets.
  const siteMatch = /^\/site\/([^/]+)(?:\/model\/([^/]+))?/.exec(path);
  if (siteMatch) {
    const [, site, modelId] = siteMatch;
    // Guard site match for TS strictness.
    if (site) {
      const items = await collectAllSetsViaApi(site, modelId);
      if (items.length > 0) {
        return items;
      }

      // Fallback to DOM scraping if API returns nothing (e.g. failed auth token extraction for gated site).
      console.warn(`[md] API returned 0 sets for ${site}, falling back to DOM scraping`);

      // Poll DOM to bypass React SPA navigation race conditions.
      const siteLower = site.toLowerCase();
      for (let i = 0; i < 20; i++) {
        if (document.body.textContent?.toLowerCase().includes(siteLower)) {
          const anchors = collectSetAnchorsFromRoot(document);
          if (anchors.length > 0) return anchors;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return [];
    }
  }

  // Direct /set/NNN page — emit a single self-referential item to trigger set
  // expansion via the crawl hook (crawlGirlsreleasedSet below).
  if (path.includes("/set/")) {
    return [
      {
        kind: "resolve-viewer",
        viewerUrl: window.location.href,
        filename: "set_placeholder",
      },
    ];
  }

  return [];
}

// ── Crawl hook ───────────────────────────────────────────────────────────────
// GirlsReleased-specific crawl expansion logic.

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

  const res = await fetch(`/api/0.2/set/${setId}`, { headers: grAuthHeaders() });
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
        // Preserve the viewer page URL so the Downloads tab can link back to
        // the hoster page for human verification of failed downloads.
        sourceUrl: file.viewerUrl,
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
    "https://imagetwist.com/*",
    "https://*.imagetwist.com/*",
    "https://imagehaha.com/*",
    "https://*.imagehaha.com/*",
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
