import { describe, it, expect } from "bun:test";
import { eromeModel } from "../src/hosts/erome/model";

describe("Erome Hoster Model", () => {
  it("has correct configuration properties", () => {
    expect(eromeModel.id).toBe("erome");
    expect(eromeModel.displayName).toBe("EroMe");
    expect(eromeModel.galleryConfig?.galleryMatches).toEqual(["https://*.erome.com/a/*"]);
  });

  describe("collectAllItems (collectEromeItems)", () => {
    const collectAllItems = eromeModel.galleryConfig?.collectAllItems;
    expect(collectAllItems).toBeDefined();

    it("extracts images and videos correctly", () => {
      // Mock DOM structure
      const mockImgGroup = {
        querySelectorAll: () => [],
        querySelector: (selector: string) => {
          if (selector === "video source[src]" || selector === "video[src]") return null;
          if (selector === "div.img[data-src]") {
            return {
              getAttribute: (name: string) =>
                name === "data-src" ? "https://s11.erome.com/713/5Dm0diFU/V3lwSdPH.jpeg?v=1" : null,
            };
          }
          return null;
        },
      };

      const mockVideoGroup = {
        querySelectorAll: () => [],
        querySelector: (selector: string) => {
          if (selector === "video source[src]") {
            return { src: "https://v11.erome.com/713/5Dm0diFU/MHYJR1vB_720p.mp4" };
          }
          if (selector === "video[src]") return null;
          if (selector === "div.img[data-src]") return null;
          return null;
        },
      };

      const mockFallbackImgGroup = {
        querySelectorAll: () => [],
        querySelector: (selector: string) => {
          if (selector === "video source[src]" || selector === "video[src]") return null;
          if (selector === "div.img[data-src]") return null;
          if (selector === "img.img-front[src]") {
            return { src: "https://s11.erome.com/713/5Dm0diFU/fallback.jpg" };
          }
          return null;
        },
      };

      const mockScope = {
        querySelectorAll: (selector: string) => {
          if (selector === ".media-group") {
            return [mockImgGroup, mockVideoGroup, mockFallbackImgGroup];
          }
          return [];
        },
        querySelector: (selector: string) => {
          if (selector === "h1.album-title-page") {
            return { textContent: "Test Album" };
          }
          return null;
        },
      };

      const items = collectAllItems!(mockScope as unknown as Document);
      expect(items).toHaveLength(3);

      expect(items[0]).toEqual({
        kind: "resolved",
        imageUrl: "https://s11.erome.com/713/5Dm0diFU/V3lwSdPH.jpeg?v=1",
        filename: "test_album_01_V3lwSdPH.jpeg",
      });

      expect(items[1]).toEqual({
        kind: "resolved",
        imageUrl: "https://v11.erome.com/713/5Dm0diFU/MHYJR1vB_720p.mp4",
        filename: "test_album_01_MHYJR1vB_720p.mp4",
      });

      expect(items[2]).toEqual({
        kind: "resolved",
        imageUrl: "https://s11.erome.com/713/5Dm0diFU/fallback.jpg",
        filename: "test_album_02_fallback.jpg",
      });
    });
  });

  describe("getGalleryName", () => {
    it("extracts the gallery name from h1", async () => {
      const mockDoc = {
        querySelector: (selector: string) => {
          if (selector === "h1.album-title-page") {
            return { textContent: "  My Awesome Erome Gallery  " };
          }
          return null;
        },
      };

      const name = await eromeModel.getGalleryName!(mockDoc as unknown as Document);
      expect(name).toBe("My Awesome Erome Gallery");
    });

    it("returns null if h1 is missing", async () => {
      const mockDoc = {
        querySelector: () => null,
      };

      const name = await eromeModel.getGalleryName!(mockDoc as unknown as Document);
      expect(name).toBeNull();
    });
  });
});
