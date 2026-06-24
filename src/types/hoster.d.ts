// HosterModel and its constituent shapes — the single source of truth for each
// site's defaults (redirect rules, download selectors, filename strategy).
// HosterId is defined here (the primitive) and re-exported from global.d.ts so
// settings code can import it from either place.

import type { GalleryJobItem, MDGalleryStartRequest } from "./messages";
import type { MDConfig } from "./global";

export type HosterId =
  | "imagebam"
  | "imgbox"
  | "imgbb"
  | "bunkr"
  | "erome"
  | "jpg6"
  | "girlsreleased";

export type RedirectRule = {
  id: string; // stable slug for user-override keying, e.g. "imagebam-new"
  description: string; // shown in the options UI
  pattern: string; // regex string, run in JS via new RegExp(pattern, "i")
  template: string; // redirect URL template — $1/$2 reference capture groups
  enabled: boolean;
};

export type FilenameStrategy =
  | { type: "dom"; selector: string; attr?: string } // read text/attr from a DOM node
  | { type: "url-slug" } // last path segment of location.href
  | { type: "uuid-fallback"; domSelector: string }; // imagebam: prefer slug when name is a UUID

export type DownloadConfig = {
  buttonSelector: string; // the existing download control to hijack
  imageSelector?: string; // displayed image, used to prefer a cache-warm URL
  filenameStrategy: FilenameStrategy;
  uiMode: "inline-after" | "button-overlay"; // where feedback UI attaches
  pathGuard?: string; // runtime regex on location.pathname before activating (imgbox)
};

// ── Gallery support ──────────────────────────────────────────────────────────

// How to extract full-res image URLs from a gallery page's DOM.
// buildUrl is a pure function (never stored in chrome.storage) so it can contain
// arbitrary transform logic (e.g. the imgbox hostname + suffix swap).
export type GalleryImageSource =
  | {
      strategy: "thumbnail-transform";
      selector: string; // CSS selector for <img> elements in the gallery grid
      buildUrl: (thumbSrc: string) => string; // pure fn: thumb URL → full-res URL
    }
  | {
      strategy: "anchor-href";
      imageSelector: string; // CSS selector for <img> elements whose .src IS the full-res URL
    }
  | {
      strategy: "resolve-viewer";
      anchorSelector: string; // CSS selector for <a> links to viewer pages
      extractor: string; // regex string sent to SW: group 1 = raw CDN URL in viewer HTML
      filenameSelector?: string; // CSS selector (relative to the anchor) to locate the filename text
    };

// Optional hooks the SW calls during viewer-page resolution. These let each
// hoster own its peculiarities (bunkr signing, video <source> fallback, etc.)
// without the SW knowing hoster-specific details.

// Parse the raw media URL from viewer page HTML. Overrides the regex extractor.
// Can also return a filename override. Return null to fall back to the regex.
export type ExtractFromViewer = (html: string) => { url: string; filename?: string } | null;

// Transform a raw CDN URL into a downloadable URL (e.g. call a sign API).
// If absent, the raw URL is used directly.
export type ResolveUrl = (
  rawUrl: string,
  viewerUrl?: string,
) => Promise<string | { url: string; filename?: string }>;

// A resolve-viewer item whose URL must be derived by the host itself (it fetches
// the viewer page however it needs to — POST interstitial, credentialed GET, etc.).
// When present, the framework does NOT pre-fetch the viewer page; this hook is the
// sole authority. Mutually exclusive with extractFromViewer in practice.
export type ResolveFromViewer = (viewerUrl: string) => Promise<{ url: string; filename?: string }>;

// ── Crawl phase (aggregator hosters like girlsreleased) ──────────────────────
// A crawl phase resolves a listing page's items into per-sub-gallery download
// jobs BEFORE any download starts. Each item on the listing (e.g. a /set/ link)
// is "crawled" — fetched, parsed, and expanded into a concrete set of download
// items — and the resulting download jobs are posted only after the entire crawl
// completes (or is aborted). This keeps all hoster-specific crawl knowledge
// (API endpoints, response parsing, thumbnail transforms, sort order) inside the
// model, not in the shared gallery runner.

export type CrawlResult = {
  req: MDGalleryStartRequest;
  postedAt: number;
};

export type CrawlConfig = {
  // Whether a collected item is a crawl item (requires expansion into sub-items).
  // Replaces the old `item.viewerUrl.includes("/set/")` check that was inlined
  // into the shared gallery runner.
  isCrawlItem: (item: GalleryJobItem) => boolean;
  // Expand one crawl item into a download-job request (or null if it yields
  // nothing). Runs in MAIN world. The shared runner handles the crawl job
  // lifecycle (progress, cancellation, concurrency); this hook owns all
  // hoster-specific resolution (API fetch, parse, thumbnail transform, naming).
  crawlItem: (
    item: GalleryJobItem,
    model: HosterModel,
    config: MDConfig,
  ) => Promise<CrawlResult | null>;
  // Optional sort for the crawl results before posting download jobs (e.g. by
  // posted date descending). Preserves insertion order when absent.
  sortCrawlResults?: (a: CrawlResult, b: CrawlResult) => number;
  // Max concurrent crawl-item fetches. Defaults to 8 in the shared runner.
  crawlConcurrency?: number;
};

export type GalleryConfig = {
  galleryMatches: string[]; // manifest content_scripts matches for gallery pages
  // imagebam only: selector PRESENT on viewer pages, ABSENT on gallery pages.
  // Used to distinguish them since both share /view/* URL pattern.
  // Confirmed: gallery pages have no img.main-image element.
  viewerIndicator?: string;
  albumNameSelector: string; // CSS selector for the album/gallery title text node
  albumIdFromPath: string; // regex on location.pathname — group 1 = album id for subfolder
  imageSource: GalleryImageSource;
  // Optional: collect all gallery items from MAIN world. For hosters where items
  // are loaded dynamically via JS (e.g. Bunkr's window.albumFiles, or
  // girlsreleased's paginated API), this bypasses DOM-scraping strategies and
  // returns the complete item list directly. May be async — e.g. girlsreleased
  // paginates the /api/0.3/sets/... endpoint to discover every set across all
  // pages, not just the ones the SPA has rendered into the DOM.
  // Runs in MAIN world so it has full access to page JS globals (incl. fetch).
  // When root is provided, queries against it instead of document (used by
  // fetchAdditionalItems for paginated pages).
  collectAllItems?: (root?: Document | Element) => GalleryJobItem[] | Promise<GalleryJobItem[]>;
  // Optional SW-side hooks (see type docs above).
  extractFromViewer?: ExtractFromViewer;
  resolveUrl?: ResolveUrl;
  resolveFromViewer?: ResolveFromViewer;
  // Optional: test whether a gallery item's filename is "bizarre" (UUID,
  // mojibake, etc.). When the user enables "Use Fallback Name" for this
  // hoster, items whose filename matches this test use the file ID from the
  // anchor href instead.
  isBizarreName?: (name: string) => boolean;
  pathGuard?: string; // runtime regex on location.pathname before activating (jpg6 / user pages)
  waitForSelector?: string; // wait for this selector to exist in DOM before running gallery adapter
  // Crawl phase for aggregator hosters (girlsreleased). When present and the
  // collected items include crawl items, the shared runner enters a visible,
  // cancellable crawl phase before posting download jobs. See CrawlConfig above.
  crawlConfig?: CrawlConfig;
  // When true, media (video/audio) downloads for this hoster go through the
  // offscreen document to bypass Referer checks (erome). The SW checks this
  // flag instead of hardcoding the hoster's domain.
  offscreenForMediaFiles?: boolean;
};

export type HosterModel = {
  id: HosterId;
  displayName: string;
  viewerMatches: string[]; // manifest content_scripts matches — viewer pages
  cdnMatches: string[]; // manifest content_scripts matches — CDN domains (redirect)
  defaultRedirectRules: RedirectRule[];
  downloadConfig: DownloadConfig;
  defaultCssOverrides: string; // empty string when none
  galleryConfig?: GalleryConfig; // undefined = no gallery support for this hoster
  // Async because some hosters (imagebam) need to fetch a secondary page to
  // resolve the album name. Callers must await the result.
  getGalleryName?: (doc: Document) => Promise<string | null>;
  // Called once from the ISOLATED world when a hoster's page is entered and the
  // extension + hoster are enabled. Owns per-hoster side effects like cookie
  // seeding (imagebam's nsfw_inter cookie). Replaces `model.id ===` checks.
  onPageEnter?: () => void;
  // Extra host_permissions the SW needs for this hoster beyond what
  // viewerMatches + galleryMatches + cdnMatches imply (e.g. CDN domains for
  // fetch, sign-API endpoints). Used by vite.config.ts to build the manifest.
  hostPermissions?: string[];
  // declarativeNetRequest header-modification rules the SW registers on startup.
  // Each rule gets a stable numeric ID derived from the model's position in
  // ALL_MODELS. Used by erome to set the Referer header its CDN requires.
  // Replaces hardcoded per-hoster DNR logic in the SW bootstrap.
  headerRules?: HeaderRule[];
};

// A declarativeNetRequest header modification. The SW translates this into a
// dynamic rule at startup. urlFilter follows chrome.declarativeNetRequest
// syntax (e.g. "*://*.erome.com/*").
export type HeaderRule = {
  urlFilter: string;
  header: string;
  value: string;
};
