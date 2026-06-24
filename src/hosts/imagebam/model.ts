import type { HosterModel } from "../../types/hoster";

// ImageBam sometimes assigns UUIDs or mojibake (broken Unicode from encoding
// mismatches) as filenames. When the user enables "Use Fallback Name", this
// test determines whether a gallery item's filename is bizarre enough to
// warrant using the file ID from the URL instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBizarreName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  const base = dot >= 0 ? name.slice(0, dot) : name;
  if (!base) return true;
  if (UUID_RE.test(base)) return true;
  // Mojibake: contains replacement chars, soft hyphens, or other garbled
  // Unicode that signals an encoding mismatch (common on imagebam).
  if (/[\u00C0-\u00FF\u00AD\uFFFD]/.test(base)) return true;
  return false;
}

export const imagebamModel: HosterModel = {
  id: "imagebam",
  displayName: "ImageBam",
  viewerMatches: ["https://www.imagebam.com/image/*", "https://www.imagebam.com/view/*"],
  cdnMatches: ["https://*.imagebam.com/*"],
  defaultRedirectRules: [
    {
      id: "imagebam-new",
      description: "New format (uppercase ID, _o/_t suffix)",
      pattern:
        "^https?://(?:thumbs|images)\\d+\\.imagebam\\.com(?:/[a-f0-9]{2}){3}/([A-Z0-9]{7,})_[ot]\\.(gif|jpe?g|png)$",
      template: "https://www.imagebam.com/view/$1",
      enabled: true,
    },
    {
      id: "imagebam-old",
      description: "Old format (lowercase ID, no suffix)",
      pattern:
        "^https?://(?:images|thumbs)\\d\\.imagebam\\.com/(?:[a-f0-9]{2}/){3}([a-z0-9]+)\\.(png|jpe?g|gif)$",
      template: "https://www.imagebam.com/image/$1",
      enabled: true,
    },
  ],
  downloadConfig: {
    buttonSelector: 'a.dropdown-item[target="_blank"]',
    imageSelector: "img.main-image",
    filenameStrategy: { type: "uuid-fallback", domSelector: "span.name.text-ellipsis" },
    uiMode: "inline-after",
  },
  defaultCssOverrides: "",
  onPageEnter: () => {
    // ImageBam shows an NSFW interstitial without this cookie. Seed it so
    // viewer/gallery pages load the media directly.
    if (!document.cookie.includes("nsfw_inter=1")) {
      document.cookie = "nsfw_inter=1; path=/; max-age=21600";
    }
  },
  hostPermissions: ["https://*.imagebam.com/*"],
  galleryConfig: {
    // Imagebam gallery pages share /view/* with single-image viewer pages.
    // viewerIndicator tells isolated.ts: if img.main-image is ABSENT → gallery page.
    galleryMatches: ["https://www.imagebam.com/view/*", "https://www.imagebam.com/gallery/*"],
    viewerIndicator: "img.main-image",
    albumNameSelector: "h1",
    albumIdFromPath: "^/(?:view|gallery)/([a-zA-Z0-9]+)$",
    imageSource: {
      strategy: "resolve-viewer",
      // Gallery grid contains links to viewer pages like <a href=".../view/ID" class="thumbnail">
      // with filename inside <span class="title">.
      anchorSelector: "a.thumbnail",
      filenameSelector: ".title",
      extractor: '<img src="([^"]+)"[^>]*class="main-image',
    },
    isBizarreName,
  },
  getGalleryName: async (doc: Document): Promise<string | null> => {
    const galleryNameEl = doc.querySelector("#gallery-name");
    if (galleryNameEl?.textContent) {
      return galleryNameEl.textContent.trim();
    }
    // On a viewer page, the gallery name isn't rendered — but a "Back to
    // gallery" link points to the gallery page. Fetch it and extract the
    // name from there. This keeps the URL-fetch logic inside the model
    // (it was previously inlined into the shared downloader.ts).
    const backLink = Array.from(doc.querySelectorAll("a")).find(
      (a) => a.textContent?.includes("Back to gallery") || !!a.querySelector(".fa-reply"),
    );
    if (backLink) {
      const href = backLink.getAttribute("href");
      if (href) {
        const url = new URL(href, doc.baseURI || location.href).href;
        try {
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            const fetchedDoc = new DOMParser().parseFromString(text, "text/html");
            const name = fetchedDoc.querySelector("#gallery-name")?.textContent?.trim();
            if (name) return name;
          }
        } catch (e) {
          console.error("[md] failed to fetch gallery name:", e);
        }
        // Fall back to the URL slug if the fetch or parse failed.
        return url.split("/").at(-1) || null;
      }
    }
    return null;
  },
};
