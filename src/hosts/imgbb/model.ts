import type { GalleryJobItem } from "../../types/messages";
import type { HosterModel } from "../../types/hoster";

// imgbb embeds each image's full metadata as a URL-encoded JSON in a
// data-object attribute on the .list-item element. The <img> in the DOM
// shows the "medium" (compressed preview) URL — we need the "image" (full-res)
// URL from data-object instead.

interface ImgBBObject {
  image?: { url?: string; filename?: string };
  medium?: { url?: string };
  thumb?: { url?: string };
  filename?: string;
  url?: string;
  url_viewer?: string;
}

function collectImgbbItems(root?: Document | Element): GalleryJobItem[] {
  const scope = root ?? document;
  const items = Array.from(scope.querySelectorAll<HTMLElement>(".list-item"));
  const result: GalleryJobItem[] = [];
  for (const item of items) {
    const raw = item.getAttribute("data-object");
    if (!raw) continue;
    try {
      const decoded = decodeURIComponent(raw);
      const obj = JSON.parse(decoded) as ImgBBObject;
      const imageUrl = obj.image?.url;
      if (!imageUrl) continue;
      const filename = obj.image?.filename ?? obj.filename ?? imageUrl.split("/").at(-1) ?? "file";
      result.push({ kind: "resolved", imageUrl, filename });
    } catch {
      // Not valid JSON — skip
    }
  }
  console.log(`[md] ImgBB: found ${result.length} items from data-object`);
  return result;
}

export const imgbbModel: HosterModel = {
  id: "imgbb",
  displayName: "ImgBB",
  // Viewer pages also live on two alias hosts besides ibb.co:
  //  - ibb.co.com — a live mirror serving the identical viewer/album markup
  //    (without a match here the extension never activates and the site's
  //    download button falls back to a cross-origin navigation → image opens
  //    in the browser instead of downloading).
  //  - <username>.imgbb.com — user subdomains can render the viewer page under
  //    the gallery host. The gallery branch in matchPage runs first and claims
  //    "/" and "/album/*"; anything else (e.g. "/<code>") falls through to the
  //    viewer matcher. Non-viewer strays (/login, /settings) simply find no
  //    a.btn-download and bail harmlessly.
  viewerMatches: ["https://ibb.co/*", "https://ibb.co.com/*", "https://*.imgbb.com/*"],
  cdnMatches: [],
  defaultRedirectRules: [],
  downloadConfig: {
    buttonSelector: "a.btn-download",
    filenameStrategy: { type: "dom", selector: "a.btn-download", attr: "download" },
    uiMode: "button-overlay",
  },
  defaultCssOverrides: "",
  hostPermissions: ["https://ibb.co/*", "https://*.ibb.co/*", "https://*.imgbb.com/*"],
  galleryConfig: {
    // User galleries live at <username>.imgbb.com (subdomain assigned per
    // user); albums live at ibb.co/album/*. The *.imgbb.com match pattern also
    // matches the apex/language subdomains' upload pages — harmless, the
    // adapter finds no .list-item there and bails without injecting a button.
    // ibb.co.com/album/* covers the mirror's album pages (same markup).
    galleryMatches: [
      "https://ibb.co/album/*",
      "https://*.imgbb.com/*",
      "https://ibb.co.com/album/*",
    ],
    // User galleries (and their sort tabs ?sort=...) live at the root path;
    // /album/* covers ibb.co albums. Excludes /login, /settings, /albums, etc.
    pathGuard: "^/(?:album/|$)",
    albumNameSelector: "h1",
    albumIdFromPath: "^/album/([^/?]+)",
    imageSource: {
      strategy: "anchor-href",
      // Fallback only — collectAllItems reads data-object for full-res URLs.
      imageSelector: ".image-container img",
    },
    // User galleries use "endless" cursor pagination: only a next link
    // (?page=N&seek=...) exists, so page 3+ is discoverable solely from page 2.
    // On the last page the next link is disabled (no href) → null ends the chain.
    nextPageUrl: (doc: Document): string | null =>
      doc.querySelector<HTMLAnchorElement>(".content-listing-pagination .pagination-next a[href]")
        ?.href ?? null,
    collectAllItems: collectImgbbItems,
  },
  getGalleryName: async (doc: Document): Promise<string | null> => {
    // User galleries: no album breadcrumb exists; the profile block's <h1>
    // holds the display name (e.g. "Coba 97").
    const userName = doc.querySelector<HTMLElement>("#top-user h1")?.textContent?.trim();
    if (userName) return userName;
    // Album pages: imgbb's <h1> truncates the album name with a literal "..." suffix (CSS
    // text-overflow). The full name is in the breadcrumb <a data-text="album-name">.
    const breadcrumb = doc.querySelector<HTMLAnchorElement>('a[data-text="album-name"]');
    return breadcrumb?.textContent?.trim() ?? null;
  },
};
