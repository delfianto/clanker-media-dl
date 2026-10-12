import { describe, expect, it } from "bun:test";
import {
  carouselItems,
  collectCarousel,
  readCarousel,
  type CarouselState,
  type CivitaiMedia,
} from "../src/hosts/civitai/carousel";
import { ALL_MODELS } from "../src/hosts";
import { DEFAULT_SETTINGS } from "../src/settings/schema";

const image: CivitaiMedia = {
  id: 122978515,
  name: "00050-2932531027.png",
  url: "066e0357-bed3-41e4-99c2-71d5cfd69056",
  type: "image",
};
const video: CivitaiMedia = { id: 2, name: "sample clip.webm", url: "video-uuid", type: "video" };
const origin = "https://civitai.red";

function nodeFor(state: CarouselState): Element {
  const provider = { memoizedProps: { value: state } };
  const carousel = {
    memoizedProps: { images: state.images, next() {}, previous() {} },
    return: provider,
  };
  return { __reactFiber$test: { return: carousel } } as unknown as Element;
}

describe("Civitai carousel", () => {
  it("registers both domains and enables existing installations via defaults", () => {
    expect(ALL_MODELS.find((model) => model.id === "civitai")?.viewerMatches).toEqual([
      "https://civitai.com/*",
      "https://civitai.red/*",
    ]);
    expect(DEFAULT_SETTINGS.hosters.civitai.enabled).toBe(true);
  });

  it("queues original PNGs and videos with original names, deduplicating by media ID", () => {
    const items = carouselItems([image, video, image], origin);
    expect(items).toEqual([
      {
        kind: "resolved",
        imageUrl: `https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/${image.url}/original=true,metadata=keep/00050-2932531027.png`,
        filename: image.name!,
        sourceUrl: `${origin}/images/${image.id}`,
      },
      {
        kind: "resolved",
        imageUrl:
          "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/video-uuid/original=true,metadata=keep/sample%20clip.webm",
        filename: "sample clip.webm",
        sourceUrl: `${origin}/images/2`,
      },
    ]);
  });

  it("replaces video poster/thumbnail transformations with original bytes", () => {
    const items = carouselItems(
      [
        {
          ...video,
          url: "https://image.civitai.com/token/id/anim=false,transcode=true,width=450/id.jpeg",
        },
      ],
      origin,
    );
    expect(items[0]?.kind === "resolved" && items[0].imageUrl).toBe(
      "https://image.civitai.com/token/id/original=true,metadata=keep/sample%20clip.webm",
    );
  });

  it("keeps signed original blob URLs intact and handles missing names", () => {
    const items = carouselItems(
      [{ ...video, name: null, url: "https://blobs-b2.civitai.com/file/original?token=123" }],
      origin,
    );
    expect(items[0]?.filename).toBe("2.mp4");
    expect(items[0]?.kind === "resolved" && items[0].imageUrl).toBe(
      "https://blobs-b2.civitai.com/file/original?token=123",
    );
    expect(carouselItems([{ ...video, name: "test.mp4.mp4" }], origin)[0]?.filename).toBe(
      "test.mp4",
    );
    expect(() =>
      carouselItems([{ ...image, url: "https://example.com/image.png" }], origin),
    ).toThrow("Unsupported media host");
  });

  it("reads unmounted slides from the provider without matching unrelated images", () => {
    const state = { images: [image, video], hasMore: false, loadMore() {} };
    expect(readCarousel(nodeFor(state))?.images).toEqual([image, video]);
    expect(
      readCarousel({
        __reactFiber$test: { memoizedProps: { value: state } },
      } as unknown as Element),
    ).toBeNull();
  });

  it("reads the committed alternate after React updates", () => {
    const fresh = { images: [image, video], hasMore: false, loadMore() {} };
    const freshFiber = (nodeFor(fresh) as unknown as Record<string, unknown>)["__reactFiber$test"];
    const oldRoot = { stateNode: { current: {} } };
    const node = {
      __reactFiber$test: { return: oldRoot, alternate: freshFiber },
    } as unknown as Element;
    expect(readCarousel(node)?.images).toEqual([image, video]);
  });

  it("loads every page before returning the batch", async () => {
    let loads = 0;
    let state: CarouselState = {
      images: [image],
      hasMore: true,
      loadMore() {
        loads++;
        state = { images: [image, video], hasMore: false, loadMore() {} };
      },
    };
    const items = await collectCarousel(
      () => state,
      () => {},
      new AbortController().signal,
    );
    expect(items).toEqual([image, video]);
    expect(loads).toBe(1);
  });

  it("waits for an automatically loaded post tail", async () => {
    let state: CarouselState = { images: [image], hasMore: false, loadMore() {}, expectedCount: 2 };
    setTimeout(() => {
      state = { ...state, images: [image, video] };
    }, 20);
    expect(
      await collectCarousel(
        () => state,
        () => {},
        new AbortController().signal,
      ),
    ).toEqual([image, video]);
  });

  it("never returns a partial batch after the carousel closes or collection is canceled", async () => {
    let open = true;
    const state = {
      images: [image],
      hasMore: true,
      loadMore() {
        open = false;
      },
    };
    await expect(
      collectCarousel(
        () => (open ? state : null),
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("Carousel closed");
    const controller = new AbortController();
    controller.abort();
    await expect(
      collectCarousel(
        () => state,
        () => {},
        controller.signal,
      ),
    ).rejects.toThrow();
  });
});
