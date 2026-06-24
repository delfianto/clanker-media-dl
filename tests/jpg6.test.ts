import { describe, it, expect } from "bun:test";
import { jpg6Model } from "../src/hosts/jpg6/model";

describe("JPG6 Hoster Model", () => {
  it("has correct configuration properties", () => {
    expect(jpg6Model.id).toBe("jpg6");
    expect(jpg6Model.displayName).toBe("JPG6");
    expect(jpg6Model.galleryConfig?.galleryMatches).toContain("https://jpg6.su/*");
  });

  describe("collectAllItems (collectJpg6Items)", () => {
    const collectAllItems = jpg6Model.galleryConfig?.collectAllItems;
    expect(collectAllItems).toBeDefined();

    it("extracts images from data-object attributes", async () => {
      const itemData = {
        image: {
          url: "https://simp6.cuckcapital.cr/images4/IMG_49747b256daad3c59a03.jpg",
          filename: "IMG_49747b256daad3c59a03.jpg",
        },
      };

      const mockItem = {
        getAttribute: (name: string) => {
          if (name === "data-object") {
            return encodeURIComponent(JSON.stringify(itemData));
          }
          return null;
        },
      };

      const mockScope = {
        querySelectorAll: (selector: string) => {
          if (selector === ".list-item") {
            return [mockItem];
          }
          return [];
        },
      };

      const items = await collectAllItems!(mockScope as unknown as Document);
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        kind: "resolved",
        imageUrl: "https://simp6.cuckcapital.cr/images4/IMG_49747b256daad3c59a03.jpg",
        filename: "IMG_49747b256daad3c59a03.jpg",
      });
    });
  });

  describe("getGalleryName", () => {
    it("extracts the gallery name from h1", async () => {
      const mockDoc = {
        querySelector: (selector: string) => {
          if (selector === "h1") {
            return { textContent: "Janise's Album" };
          }
          return null;
        },
      };

      const name = await jpg6Model.getGalleryName!(mockDoc as unknown as Document);
      expect(name).toBe("Janise's Album");
    });
  });
});
