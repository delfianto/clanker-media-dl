import type { GalleryJobItem } from "../../types/messages";
import type { HosterModel } from "../../types/hoster";

// Erome hosts both images and videos directly on its album/gallery pages.
// We parse the DOM elements inside each .media-group container to extract
// direct media URLs (source tags for videos, and data-src / img tags for images).

function collectEromeItems(root?: Document | Element): GalleryJobItem[] {
  const scope = root ?? document;
  const mediaGroups = Array.from(scope.querySelectorAll(".media-group"));
  const result: GalleryJobItem[] = [];

  const albumName = scope.querySelector("h1.album-title-page")?.textContent?.trim() || "EroMe";
  const normalizedAlbumName = albumName.replace(/\s+/g, "_").toLowerCase();

  // First pass: identify media types and count
  const itemsWithTypes = mediaGroups
    .map((group) => {
      // 1. Check for video
      const sourceEl = group.querySelector<HTMLSourceElement>("video source[src]");
      const videoEl = group.querySelector<HTMLVideoElement>("video[src]");
      const videoUrl = sourceEl?.src || videoEl?.src;

      if (videoUrl && videoUrl.startsWith("http")) {
        return { type: "video" as const, url: videoUrl };
      }

      // 2. Check for image
      const imgDiv = group.querySelector<HTMLDivElement>("div.img[data-src]");
      const imageUrl = imgDiv?.getAttribute("data-src");
      if (imageUrl && imageUrl.startsWith("http")) {
        return { type: "image" as const, url: imageUrl };
      }

      // Fallback
      const imgFront = group.querySelector<HTMLImageElement>("img.img-front[src]");
      const fallbackUrl = imgFront?.src;
      if (fallbackUrl && fallbackUrl.startsWith("http")) {
        return { type: "image" as const, url: fallbackUrl };
      }

      return null;
    })
    .filter((x): x is { type: "video" | "image"; url: string } => x !== null);

  const totalVids = itemsWithTypes.filter((x) => x.type === "video").length;
  const totalImgs = itemsWithTypes.filter((x) => x.type === "image").length;

  const vidPadLength = Math.max(2, String(totalVids).length);
  const imgPadLength = Math.max(2, String(totalImgs).length);

  let vidCount = 0;
  let imgCount = 0;

  for (const item of itemsWithTypes) {
    if (item.type === "video") {
      vidCount++;
      const num = String(vidCount).padStart(vidPadLength, "0");
      const originalName = item.url.split("/").at(-1) || "video.mp4";
      const filename = `${normalizedAlbumName}_${num}_${originalName}`;
      result.push({
        kind: "resolved",
        imageUrl: item.url,
        filename,
      });
    } else {
      imgCount++;
      const num = String(imgCount).padStart(imgPadLength, "0");
      const urlObj = new URL(item.url);
      const originalName = urlObj.pathname.split("/").at(-1) || "image.jpg";
      const filename = `${normalizedAlbumName}_${num}_${originalName}`;
      result.push({
        kind: "resolved",
        imageUrl: item.url,
        filename,
      });
    }
  }

  console.log(
    `[md] EroMe: found ${result.length} items from media-group elements (${imgCount} images, ${vidCount} videos)`,
  );
  return result;
}

export const eromeModel: HosterModel = {
  id: "erome",
  displayName: "EroMe",
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
    galleryMatches: ["https://*.erome.com/a/*"],
    albumNameSelector: "h1.album-title-page",
    albumIdFromPath: "^/a/([^/?]+)",
    imageSource: {
      strategy: "anchor-href",
      // Fallback only — collectAllItems collects the resolved URLs directly.
      imageSelector: ".media-group img.img-front",
    },
    collectAllItems: collectEromeItems,
  },
  getGalleryName: (doc: Document) => {
    const h1 = doc.querySelector("h1.album-title-page");
    return h1?.textContent?.trim() ?? null;
  },
};
