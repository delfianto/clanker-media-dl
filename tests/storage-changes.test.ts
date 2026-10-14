import { describe, expect, it } from "bun:test";
import { applyStorageChanges } from "../src/settings/storage-changes";
import { DEFAULT_SETTINGS } from "../src/settings/schema";
import { carouselSubfolder } from "../src/hosts/civitai/folders";
import type { MDConfig, Settings } from "../src/types/global";

function configFor(settings: Settings): MDConfig {
  return {
    hosterId: "civitai",
    pageType: "viewer",
    maxParallelImg: settings.maxParallelImg,
    maxParallelVid: settings.maxParallelVid,
    downloadDirectory: settings.downloadDirectory,
    autoFolderPerAlbum: settings.autoFolderPerAlbum,
    ...settings.hosters.civitai,
  };
}

describe("live download settings", () => {
  it("switches an open carousel from loose files to an album folder after saving", () => {
    const loaded = { ...structuredClone(DEFAULT_SETTINGS), autoFolderPerAlbum: false };
    const oldConfig = configFor(loaded);
    expect(carouselSubfolder("carousel 123", "v3.0 FP16", 3, oldConfig)).toBe("Clanker");
    const updated = applyStorageChanges(loaded, { autoFolderPerAlbum: { newValue: true } });
    expect(carouselSubfolder("carousel 123", "v3.0 FP16", 3, configFor(updated))).toBe(
      "Clanker/v3.0 FP16",
    );
    // The active collection's config snapshot must remain intact.
    expect(oldConfig.autoFolderPerAlbum).toBe(false);
    expect(loaded.autoFolderPerAlbum).toBe(false);
  });

  it("updates Civitai's overrides and preserves the other saved settings", () => {
    const loaded = structuredClone(DEFAULT_SETTINGS);
    const hosters = structuredClone(loaded.hosters);
    hosters.civitai.skipFolderWhenSingleImage = false;
    hosters.civitai.useModelVariantAsGalleryName = false;
    const updated = applyStorageChanges(loaded, {
      hosters: { newValue: hosters },
      downloadDirectory: { newValue: "Images" },
    });
    expect(carouselSubfolder("carousel 123", "v3.0 FP16", 1, configFor(updated))).toBe(
      "Images/carousel 123",
    );
    expect(updated.maxParallelImg).toBe(loaded.maxParallelImg);
    expect(loaded.hosters.civitai.skipFolderWhenSingleImage).toBe(true);
  });

  it("restores removed settings and fills hosters missing from older storage", () => {
    const loaded = { ...structuredClone(DEFAULT_SETTINGS), autoFolderPerAlbum: false };
    const updated = applyStorageChanges(loaded, {
      autoFolderPerAlbum: {},
      hosters: { newValue: { imagebam: loaded.hosters.imagebam } },
    });
    expect(updated.autoFolderPerAlbum).toBe(DEFAULT_SETTINGS.autoFolderPerAlbum);
    expect(updated.hosters.civitai).toEqual(DEFAULT_SETTINGS.hosters.civitai);
  });

  it("ignores unrelated storage keys", () => {
    const loaded = structuredClone(DEFAULT_SETTINGS);
    expect(applyStorageChanges(loaded, { jobHistory: { newValue: [] } })).toEqual(loaded);
  });
});
