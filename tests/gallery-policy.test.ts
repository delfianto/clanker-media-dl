import { describe, expect, it } from "bun:test";
import { downloadParallelism, findCompletedGalleryItem } from "../src/background/gallery-policy";
import type { GalleryJobItem } from "../src/types/messages";

const item: GalleryJobItem = {
  kind: "resolved",
  imageUrl: "https://image.civitai.com/id/original=true/file.png",
  filename: "file.png",
};

describe("gallery history policy", () => {
  it("ignores saved history when skip existing is disabled or a fresh download is requested", async () => {
    let reads = 0;
    const found = await findCompletedGalleryItem(item, "Clanker", false, undefined, async () => {
      reads++;
      return { filename: "previous.png" };
    });
    expect(found).toBeNull();
    expect(reads).toBe(0);
  });

  it("skips a previous download when the setting is enabled", async () => {
    const found = await findCompletedGalleryItem(
      item,
      "Clanker",
      true,
      undefined,
      async (folder, url) => {
        expect(folder).toBe("Clanker");
        expect(url).toBe(item.kind === "resolved" ? item.imageUrl : "");
        return { filename: "previous.png" };
      },
    );
    expect(found?.filename).toBe("previous.png");
  });

  it("preserves completed work in the same job when resuming a forced download", async () => {
    const found = await findCompletedGalleryItem(
      item,
      "Clanker",
      false,
      { displayName: item.imageUrl, filename: "finished.png", status: "done" },
      async () => {
        throw new Error("must not read other jobs");
      },
    );
    expect(found?.filename).toBe("finished.png");
  });

  it("does not skip a failed or unrelated prior item", async () => {
    for (const previous of [
      { displayName: item.imageUrl, filename: "failed.png", status: "error" },
      { displayName: "other URL", filename: "other.png", status: "done" },
    ]) {
      expect(
        await findCompletedGalleryItem(item, "Clanker", false, previous, async () => null),
      ).toBeNull();
    }
  });

  it("uses the item's subfolder and viewer URL for per-set history lookup", async () => {
    const viewer: GalleryJobItem = {
      kind: "resolve-viewer",
      viewerUrl: "https://example.com/image/1",
      filename: "file.png",
      subfolder: "Clanker/set",
    };
    await findCompletedGalleryItem(viewer, "Clanker", true, undefined, async (folder, url) => {
      expect(folder).toBe("Clanker/set");
      expect(url).toBe(viewer.viewerUrl);
      return null;
    });
  });
});

describe("gallery parallelism", () => {
  it("uses working defaults for zero, negative, missing, or non-finite settings", () => {
    for (const value of [0, -1, NaN, Infinity, undefined as unknown as number])
      expect(downloadParallelism(value, 5, 20)).toBe(5);
  });
  it("bounds valid parallelism to the supported range", () => {
    expect(downloadParallelism(3, 5, 20)).toBe(3);
    expect(downloadParallelism(2.5, 5, 20)).toBe(2);
    expect(downloadParallelism(100, 5, 20)).toBe(20);
  });
});
