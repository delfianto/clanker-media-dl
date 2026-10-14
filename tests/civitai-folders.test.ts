import { describe, expect, it } from "bun:test";
import { carouselSubfolder, readSelectedModelVariant } from "../src/hosts/civitai/folders";
import { carouselItems } from "../src/hosts/civitai/carousel";
import { DEFAULT_SETTINGS } from "../src/settings/schema";
import type { MDConfig } from "../src/types/global";

const config: MDConfig = {
  hosterId: "civitai",
  pageType: "viewer",
  maxParallelImg: 5,
  maxParallelVid: 1,
  downloadDirectory: "Clanker",
  autoFolderPerAlbum: true,
};
const fallback = "Civitai model 2786499 - carousel 122978515";

// Like the carousel fiber fixtures, provide only the DOM surface read by the
// detector. Text content excludes aria-label="Loaded", as it does in the DOM.
function pillDocument(groups: { label: string; color: string }[][]): Document {
  return {
    querySelectorAll: () =>
      groups.map((pills) => ({
        querySelectorAll: () =>
          pills.map(({ label, color }) => ({
            style: { getPropertyValue: () => `var(--mantine-color-${color}-filled)` },
            querySelector: () => ({ textContent: label }),
          })),
      })),
  } as unknown as Document;
}

describe("Civitai selected version pills", () => {
  it("reads the blue selected pill among gray versions and normalizes whitespace", () => {
    expect(
      readSelectedModelVariant(
        pillDocument([
          [
            { label: " v3.0  INT8 + FP8\n Extended ", color: "blue" },
            { label: "v2.5 INT8 Turbo", color: "gray" },
            { label: "v3.0 Q4 GGUF Extended", color: "gray" },
          ],
        ]),
      ),
    ).toBe("v3.0 INT8 + FP8 Extended");
  });

  it("supports variants without a v prefix in a multi-version picker", () => {
    expect(
      readSelectedModelVariant(
        pillDocument([
          [
            { label: "FP16", color: "gray" },
            { label: "Pruned", color: "blue" },
          ],
        ]),
      ),
    ).toBe("Pruned");
  });

  it("falls back for absent, empty, unselected or ambiguous pills", () => {
    for (const groups of [
      [],
      [
        [
          { label: "", color: "blue" },
          { label: "v2", color: "gray" },
        ],
      ],
      [
        [
          { label: "v1", color: "gray" },
          { label: "v2", color: "gray" },
        ],
      ],
      [
        [
          { label: "v1", color: "blue" },
          { label: "v2", color: "blue" },
        ],
      ],
      [[{ label: "v1", color: "blue" }], [{ label: "v2", color: "blue" }]],
    ])
      expect(readSelectedModelVariant(pillDocument(groups))).toBeNull();
  });

  it("ignores standalone actions and unrelated colored button groups", () => {
    expect(
      readSelectedModelVariant(
        pillDocument([
          [{ label: "Download", color: "blue" }],
          [
            { label: "v1", color: "blue" },
            { label: "v2", color: "red" },
          ],
        ]),
      ),
    ).toBeNull();
    expect(readSelectedModelVariant(pillDocument([[{ label: "v3.0 FP16", color: "blue" }]]))).toBe(
      "v3.0 FP16",
    );
  });
});

describe("Civitai carousel folders", () => {
  it("enables both options for new and existing settings", () => {
    expect(DEFAULT_SETTINGS.hosters.civitai.useModelVariantAsGalleryName).toBe(true);
    expect(DEFAULT_SETTINGS.hosters.civitai.skipFolderWhenSingleImage).toBe(true);
    expect(carouselSubfolder(fallback, "v3.0 FP16", 2, config)).toBe("Clanker/v3.0 FP16");
  });

  it("uses the existing carousel name when the variant is unknown or disabled", () => {
    expect(carouselSubfolder(fallback, null, 2, config)).toBe(`Clanker/${fallback}`);
    expect(carouselSubfolder(fallback, "   ", 2, config)).toBe(`Clanker/${fallback}`);
    expect(
      carouselSubfolder(fallback, "v3.0 FP16", 2, {
        ...config,
        useModelVariantAsGalleryName: false,
      }),
    ).toBe(`Clanker/${fallback}`);
  });

  it("sanitizes the variant as one folder, including slashes and traversal text", () => {
    expect(carouselSubfolder(fallback, "../FP16 / FP8: Extended", 2, config)).toBe(
      "Clanker/FP16 _ FP8_ Extended",
    );
  });

  it("skips all directories for one file regardless of the album-folder toggle", () => {
    expect(carouselSubfolder(fallback, "v3.0 FP16", 1, config)).toBe("");
    expect(
      carouselSubfolder(fallback, null, 1, {
        ...config,
        autoFolderPerAlbum: false,
      }),
    ).toBe("");
    const image = { id: 1, name: "one.png", url: "media-id", type: "image" as const };
    const items = carouselItems([image, image], "https://civitai.com");
    expect(carouselSubfolder(fallback, null, items.length, config)).toBe("");
  });

  it("restores normal directories when single-file skipping is disabled", () => {
    expect(
      carouselSubfolder(fallback, "v3.0 FP16", 1, {
        ...config,
        skipFolderWhenSingleImage: false,
      }),
    ).toBe("Clanker/v3.0 FP16");
    expect(
      carouselSubfolder(fallback, null, 1, {
        ...config,
        skipFolderWhenSingleImage: false,
        useModelVariantAsGalleryName: false,
      }),
    ).toBe(`Clanker/${fallback}`);
  });

  it("respects the global folder toggle and an empty download directory for galleries", () => {
    expect(
      carouselSubfolder(fallback, "v3.0 FP16", 2, {
        ...config,
        autoFolderPerAlbum: false,
      }),
    ).toBe("Clanker");
    expect(
      carouselSubfolder(fallback, "v3.0 FP16", 2, {
        ...config,
        downloadDirectory: "",
      }),
    ).toBe("v3.0 FP16");
    expect(
      carouselSubfolder(fallback, "v3.0 FP16", 2, {
        ...config,
        downloadDirectory: "",
        autoFolderPerAlbum: false,
      }),
    ).toBe("");
  });
});
