import type { GalleryJobItem } from "../../types/messages";
import type { HosterModel } from "../../types/hoster";

interface JPG6Object {
  image?: { url?: string; filename?: string };
  medium?: { url?: string };
  thumb?: { url?: string };
  filename?: string;
  url?: string;
  url_viewer?: string;
}

function collectJpg6Items(root?: Document | Element): GalleryJobItem[] {
  const scope = root ?? document;
  const items = Array.from(scope.querySelectorAll<HTMLElement>(".list-item"));
  const result: GalleryJobItem[] = [];
  for (const item of items) {
    const raw = item.getAttribute("data-object");
    if (!raw) continue;
    try {
      const decoded = decodeURIComponent(raw);
      const obj = JSON.parse(decoded) as JPG6Object;
      const imageUrl = obj.image?.url;
      if (!imageUrl) continue;
      const filename = obj.image?.filename ?? obj.filename ?? imageUrl.split("/").at(-1) ?? "file";
      result.push({ kind: "resolved", imageUrl, filename });
    } catch {
      // Not valid JSON — skip
    }
  }
  console.log(`[md] JPG6: found ${result.length} items from data-object`);
  return result;
}

export const jpg6Model: HosterModel = {
  id: "jpg6",
  displayName: "JPG6",
  viewerMatches: ["https://jpg6.su/img/*"],
  cdnMatches: [],
  defaultRedirectRules: [],
  downloadConfig: {
    buttonSelector: "a.btn-download",
    filenameStrategy: { type: "dom", selector: "a.btn-download", attr: "download" },
    uiMode: "button-overlay",
  },
  defaultCssOverrides: "",
  galleryConfig: {
    galleryMatches: ["https://jpg6.su/album/*", "https://jpg6.su/*"],
    pathGuard:
      "^(?!/(login|signup|upload|pages|search|settings|explore|categories|plugin|api|contact|img)($|/|\\?))",
    albumNameSelector: "h1",
    albumIdFromPath: "^/(?:album/)?([^/?]+)",
    imageSource: {
      strategy: "anchor-href",
      imageSelector: ".image-container img",
    },
    collectAllItems: collectJpg6Items,
  },
  getGalleryName: (doc: Document) => {
    const h1 = doc.querySelector("h1");
    if (h1) return h1.textContent?.trim() ?? null;
    const breadcrumb = doc.querySelector<HTMLAnchorElement>('a[data-text="album-name"]');
    return breadcrumb?.textContent?.trim() ?? null;
  },
};
