import type { GalleryJobItem } from "../../types/messages";

export type CivitaiMedia = {
  id: number;
  url: string;
  name: string | null;
  type: "image" | "video";
};

export type CarouselState = {
  images: CivitaiMedia[];
  hasMore: boolean;
  loadMore: () => void;
  // Lazy post galleries load their tail automatically rather than via loadMore.
  expectedCount?: number;
};

type Fiber = {
  memoizedProps?: Record<string, unknown>;
  return?: Fiber | null;
  alternate?: Fiber | null;
  stateNode?: { current?: Fiber };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMedia(value: unknown): value is CivitaiMedia {
  return (
    isRecord(value) &&
    typeof value["id"] === "number" &&
    typeof value["url"] === "string" &&
    (typeof value["name"] === "string" || value["name"] === null) &&
    (value["type"] === "image" || value["type"] === "video")
  );
}

// Read only the committed branch. DOM nodes can retain the previous fiber after
// React swaps its current/alternate trees (especially when loading another page).
function currentFiber(fiber: Fiber): Fiber {
  let root = fiber;
  while (root.return) root = root.return;
  return root.stateNode?.current && root.stateNode.current !== root
    ? (fiber.alternate ?? fiber)
    : fiber;
}

// Civitai's ImageDetailCarousel props identify the slideshow without relying on
// minified component names. Its ancestor context owns the *complete* image list
// and the site's own filtered, authenticated pagination. No thumbnail scraping.
export function readCarousel(node: Element): CarouselState | null {
  const key = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
  if (!key) return null;
  const raw = (node as unknown as Record<string, unknown>)[key];
  if (!isRecord(raw)) return null;
  let fiber: Fiber | null | undefined = currentFiber(raw as Fiber);
  let foundCarousel = false;
  let state: CarouselState | null = null;
  for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (!props) continue;
    if (
      Array.isArray(props["images"]) &&
      typeof props["next"] === "function" &&
      typeof props["previous"] === "function"
    )
      foundCarousel = true;
    const value = props["value"];
    if (
      foundCarousel &&
      !state &&
      isRecord(value) &&
      Array.isArray(value["images"]) &&
      value["images"].every(isMedia) &&
      typeof value["hasMore"] === "boolean" &&
      typeof value["loadMore"] === "function"
    ) {
      state = {
        images: value["images"],
        hasMore: value["hasMore"],
        loadMore: value["loadMore"] as () => void,
      };
    }
    const tail = props["postTail"];
    if (state && isRecord(tail) && typeof tail["imageCount"] === "number") {
      // Require the advertised full count. If site-side filtering makes that
      // unreachable, fail visibly rather than silently queueing a partial tail.
      state.expectedCount = tail["imageCount"];
    }
  }
  return state;
}

const CDN = "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA";

export function carouselItems(images: CivitaiMedia[], origin: string): GalleryJobItem[] {
  const seen = new Set<number>();
  return images
    .filter((image) => {
      if (seen.has(image.id)) return false;
      seen.add(image.id);
      return true;
    })
    .map((image) => {
      let filename = image.name?.trim() || `${image.id}.${image.type === "video" ? "mp4" : "png"}`;
      // Match Civitai's handling of accidental duplicated extensions.
      filename = filename.split(/[?#]/)[0] || `${image.id}`;
      const ext = /\.([a-zA-Z0-9]{2,5})$/.exec(filename)?.[1];
      if (ext) filename = filename.replace(new RegExp(`(\\.${ext})+$`), `.${ext}`);
      let imageUrl: string;
      if (image.url.startsWith("https://")) {
        const url = new URL(image.url);
        if (!["image.civitai.com", "blobs-b2.civitai.com"].includes(url.hostname)) {
          throw new Error(`Unsupported media host: ${url.hostname}`);
        }
        if (url.hostname === "image.civitai.com") {
          const segments = url.pathname.split("/");
          if (segments.length < 5) throw new Error("Unrecognized Civitai media URL");
          segments[3] = "original=true,metadata=keep";
          segments[4] = encodeURIComponent(filename);
          url.pathname = segments.join("/");
        }
        imageUrl = url.href;
      } else {
        if (!/^[a-zA-Z0-9-]+$/.test(image.url)) throw new Error("Unrecognized Civitai media ID");
        // original=true returns the stored bytes (including generation metadata),
        // with no resize, JPEG conversion, video transcode, or poster extraction.
        imageUrl = `${CDN}/${image.url}/original=true,metadata=keep/${encodeURIComponent(filename)}`;
      }
      return {
        kind: "resolved" as const,
        imageUrl,
        filename,
        sourceUrl: `${origin}/images/${image.id}`,
      };
    });
}

export async function collectCarousel(
  read: () => CarouselState | null,
  onProgress: (count: number) => void,
  signal: AbortSignal,
): Promise<CivitaiMedia[]> {
  let state = read();
  if (!state) throw new Error("Could not read this carousel. Reopen it and try again.");
  while (
    state.hasMore ||
    (state.expectedCount !== undefined && state.images.length < state.expectedCount)
  ) {
    signal.throwIfAborted();
    const previousCount = state.images.length;
    onProgress(previousCount);
    if (state.hasMore) state.loadMore();
    const deadline = Date.now() + 30_000;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      signal.throwIfAborted();
      const next = read();
      if (!next) throw new Error("Carousel closed while collecting media.");
      if (next.images.length > previousCount || (!next.hasMore && state.hasMore)) {
        state = next;
        break;
      }
      if (Date.now() >= deadline)
        throw new Error("Loading the rest of the carousel timed out. Try again.");
    }
  }
  signal.throwIfAborted();
  return state.images;
}
