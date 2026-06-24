import { describe, it, expect, mock } from "bun:test";
import { girlsreleasedModel } from "../src/hosts/girlsreleased/model";
import { resolveLeaf, thumbnailToFull } from "../src/resolvers/index";
import type { GalleryJobItem } from "../src/types/messages";

type ResolveViewerItem = Extract<GalleryJobItem, { kind: "resolve-viewer" }>;

describe("GirlsReleased Hoster Model", () => {
  it("has correct configuration properties", () => {
    expect(girlsreleasedModel.id).toBe("girlsreleased");
    expect(girlsreleasedModel.displayName).toBe("GirlsReleased");
    expect(girlsreleasedModel.galleryConfig?.galleryMatches).toContain(
      "https://girlsreleased.com/set/*",
    );
    expect(girlsreleasedModel.galleryConfig?.resolveFromViewer).toBeDefined();
  });

  describe("collectAllItems (collectGirlsreleasedItems)", () => {
    const collectAllItems = girlsreleasedModel.galleryConfig?.collectAllItems;
    expect(collectAllItems).toBeDefined();

    it("emits a single self-referential item on set pages to trigger set expansion", async () => {
      const originalWindow = global.window;
      global.window = {
        location: {
          href: "https://girlsreleased.com/set/154616",
          pathname: "/set/154616",
        },
      } as any;

      try {
        const items = await collectAllItems!();
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({
          kind: "resolve-viewer",
          viewerUrl: "https://girlsreleased.com/set/154616",
          filename: "set_placeholder",
        });
      } finally {
        global.window = originalWindow;
      }
    });

    it("paginates the API on /site/ pages and dedupes the peek-ahead overlap", async () => {
      const originalWindow = global.window;
      const originalFetch = global.fetch;
      global.window = {
        location: { pathname: "/site/femjoy.com" },
      } as any;

      const fetchedUrls: string[] = [];
      global.fetch = mock(async (url: string | URL | Request) => {
        const u = String(url);
        fetchedUrls.push(u);
        if (u.endsWith("/page/1")) {
          // 101 entries: ids 1..100 unique + id 999 = peek-ahead (dup of page 2's first)
          const sets = Array.from({ length: 100 }, (_, i) => [i + 1, `Set${i + 1}`]);
          sets.push([999, "PeekAhead"]);
          return { ok: true, json: async () => ({ sets }) } as any;
        }
        if (u.endsWith("/page/2")) {
          return {
            ok: true,
            json: async () => ({
              sets: [
                [999, "PeekAhead"],
                [200, "Last"],
              ],
            }),
          } as any;
        }
        throw new Error(`unexpected fetch: ${u}`);
      }) as unknown as typeof fetch;

      try {
        const items = (await collectAllItems!()) as ResolveViewerItem[];
        // 100 unique (ids 1..100) + 1 peek-ahead (id 999, deduped) + 1 new (id 200) = 102
        expect(items).toHaveLength(102);
        expect(fetchedUrls).toEqual([
          "/api/0.3/sets/site/femjoy.com/sort/date/page/1",
          "/api/0.3/sets/site/femjoy.com/sort/date/page/2",
        ]);
        // page 3 must NOT be fetched — page 2 returned ≤100 entries (last page)
        expect(fetchedUrls).toHaveLength(2);
        // first and last viewer URLs
        expect(items[0]?.viewerUrl).toBe("https://girlsreleased.com/set/1");
        expect(items.at(-1)?.viewerUrl).toBe("https://girlsreleased.com/set/200");
        // the peek-ahead id 999 appears exactly once
        const id999Count = items.filter((i) => i.viewerUrl.endsWith("/set/999")).length;
        expect(id999Count).toBe(1);
      } finally {
        global.fetch = originalFetch;
        global.window = originalWindow;
      }
    });

    it("uses the model-filtered API path on /site/{site}/model/{id}/{name} pages", async () => {
      const originalWindow = global.window;
      const originalFetch = global.fetch;
      global.window = {
        location: { pathname: "/site/hegre.com/model/66/Luba" },
      } as any;

      const fetchedUrls: string[] = [];
      global.fetch = mock(async (url: string | URL | Request) => {
        const u = String(url);
        fetchedUrls.push(u);
        return { ok: true, json: async () => ({ sets: [[42, "Only"]] }) } as any;
      }) as unknown as typeof fetch;

      try {
        const items = await collectAllItems!();
        expect(items).toHaveLength(1);
        expect(fetchedUrls[0]).toBe("/api/0.3/sets/site/hegre.com/model/66/sort/date/page/1");
      } finally {
        global.fetch = originalFetch;
        global.window = originalWindow;
      }
    });

    it("stops pagination on HTTP error and returns what was collected so far", async () => {
      const originalWindow = global.window;
      const originalFetch = global.fetch;
      global.window = {
        location: { pathname: "/site/femjoy.com" },
      } as any;

      global.fetch = mock(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.endsWith("/page/1")) {
          const sets = Array.from({ length: 101 }, (_, i) => [i + 1, `S${i + 1}`]);
          return { ok: true, json: async () => ({ sets }) } as any;
        }
        return { ok: false, status: 500 } as any;
      }) as unknown as typeof fetch;

      try {
        const items = await collectAllItems!();
        // page 1 returned 101 unique ids (1..101); page 2 errored → stop
        expect(items).toHaveLength(101);
      } finally {
        global.fetch = originalFetch;
        global.window = originalWindow;
      }
    });

    it("scrapes set anchors from a provided root (HTML-pagination fallback)", async () => {
      const mockSetAnchor = { href: "https://girlsreleased.com/set/154616" };
      const mockScope = {
        querySelectorAll: (selector: string) => (selector === "a" ? [mockSetAnchor] : []),
      };

      const items = await collectAllItems!(mockScope as unknown as Document);
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        kind: "resolve-viewer",
        viewerUrl: "https://girlsreleased.com/set/154616",
        filename: "set_placeholder",
      });
    });
  });

  describe("resolveLeaf and leaf resolvers", () => {
    it("returns direct URL from imx.to POST request bypass", async () => {
      const originalFetch = global.fetch;
      global.fetch = mock(async () => {
        return {
          ok: true,
          text: async () => `
            <html>
              <body>
                <img src="https://image.imx.to/u/i/2026/04/27/6r3hhr.jpg" />
              </body>
            </html>
          `,
        } as any;
      }) as unknown as typeof fetch;

      try {
        const result = await resolveLeaf("https://imx.to/i/6r3hhr");
        expect(result).toEqual({
          url: "https://image.imx.to/u/i/2026/04/27/6r3hhr.jpg",
        });
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("returns direct URL and original filename from imx.to POST request bypass when title is present", async () => {
      const originalFetch = global.fetch;
      global.fetch = mock(async () => {
        return {
          ok: true,
          text: async () => `
            <html>
              <head>
                <title>IMX.to / 17944566_tyg186_002.jpg</title>
              </head>
              <body>
                <img src="https://image.imx.to/u/i/2026/04/27/6r3hhr.jpg" />
              </body>
            </html>
          `,
        } as any;
      }) as unknown as typeof fetch;

      try {
        const result = await resolveLeaf("https://imx.to/i/6r3hhr");
        expect(result).toEqual({
          url: "https://image.imx.to/u/i/2026/04/27/6r3hhr.jpg",
          filename: "17944566_tyg186_002.jpg",
        });
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("resolves imagevenue by self-priming cookies", async () => {
      const originalFetch = global.fetch;
      const fetchCalls: { url: string; options?: any }[] = [];

      global.fetch = mock(async (url: string | URL | Request, options?: any) => {
        fetchCalls.push({ url: String(url), options });
        return {
          ok: true,
          text: async () => `
            <html>
              <head>
                <title>ImageVenue - photo.jpg</title>
              </head>
              <body>
                <img class="img-fluid" src="https://cdn-imagevenue.com/12/34/photo.jpg" />
              </body>
            </html>
          `,
        } as any;
      }) as unknown as typeof fetch;

      try {
        const result = await resolveLeaf("https://imagevenue.com/photo");
        expect(result).toEqual({
          url: "https://cdn-imagevenue.com/12/34/photo.jpg",
          filename: "photo.jpg",
        });
        expect(fetchCalls).toHaveLength(2);
        expect(fetchCalls[0]?.options?.cache).toBe("no-store");
        expect(fetchCalls[1]?.options?.cache).toBe("reload");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("throws error for unsupported hosts", async () => {
      expect(resolveLeaf("https://example.com/image")).rejects.toThrow(
        "no leaf resolver for host: example.com",
      );
    });

    it("transforms imx.to thumbnail URL to full URL via thumbnailToFull", () => {
      const full = thumbnailToFull("https://imx.to/u/t/2026/04/27/6r3hhr.jpg");
      expect(full).toBe("https://imx.to/u/i/2026/04/27/6r3hhr.jpg");
    });

    it("returns null for non-imx thumbnail URLs or invalid URLs", () => {
      expect(thumbnailToFull("https://imagevenue.com/u/t/image.jpg")).toBeNull();
      expect(thumbnailToFull("invalid-url")).toBeNull();
    });
  });

  describe("getGalleryName", () => {
    it("extracts and normalizes site name and set title", async () => {
      const mockSiteAnchor = {
        textContent: "  femjoy.com  ",
        getAttribute: (attr: string) => {
          if (attr === "href") return "/site/femjoy.com";
          return null;
        },
        closest: () => null,
      };

      const mockModelAnchor = {
        textContent: "  Ariel A  ",
        getAttribute: (attr: string) => {
          if (attr === "href") return "/site/femjoy.com/model/5208/Ariel A";
          return null;
        },
        closest: () => null,
      };

      const mockH1 = {
        textContent: "  Sway  ",
        getAttribute: () => null,
      };

      const mockDoc = {
        querySelectorAll: (selector: string) => {
          if (selector === "h1") {
            return [mockH1];
          }
          if (selector === 'a[href*="/site/"]') {
            return [mockSiteAnchor, mockModelAnchor];
          }
          return [];
        },
      };

      const name = await girlsreleasedModel.getGalleryName!(mockDoc as unknown as Document);
      expect(name).toBe("Femjoy/Ariel.A_Sway");
    });

    it("falls back to only the set title if site is not found", async () => {
      const mockH1 = {
        textContent: "  Ariel A - Sway  ",
        getAttribute: () => null,
      };

      const mockDoc = {
        querySelectorAll: (selector: string) => {
          if (selector === "h1") {
            return [mockH1];
          }
          return [];
        },
      };

      const name = await girlsreleasedModel.getGalleryName!(mockDoc as unknown as Document);
      expect(name).toBe("Ariel.A.-.Sway");
    });
  });
});
