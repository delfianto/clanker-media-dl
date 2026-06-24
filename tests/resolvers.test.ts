import { describe, it, expect, mock } from "bun:test";
import { imxResolver } from "../src/resolvers/imx";
import { imagevenueResolver } from "../src/resolvers/imagevenue";
import { resolveLeaf, thumbnailToFull, LEAF_RESOLVERS } from "../src/resolvers/index";

// Swap global.fetch for the duration of fn, always restoring it.
async function withMockFetch(
  impl: (url: string | URL | Request, options?: any) => Promise<any>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = global.fetch;
  global.fetch = mock(impl) as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    global.fetch = original;
  }
}

describe("LEAF_RESOLVERS registry", () => {
  it("registers imx, imagevenue, and imagetwist", () => {
    expect(LEAF_RESOLVERS.map((r) => r.id)).toEqual(["imx", "imagevenue", "imagetwist"]);
  });
});

describe("imxResolver.matches", () => {
  it("matches imx.to and its subdomains", () => {
    expect(imxResolver.matches(new URL("https://imx.to/i/abc"))).toBe(true);
    expect(imxResolver.matches(new URL("https://image.imx.to/u/i/x.jpg"))).toBe(true);
  });

  it("rejects lookalike / embedded hostnames (hostname match, not substring)", () => {
    expect(imxResolver.matches(new URL("https://notimx.to/i/abc"))).toBe(false);
    expect(imxResolver.matches(new URL("https://imx.to.lookalike.com/i/abc"))).toBe(false);
    expect(imxResolver.matches(new URL("https://example.com/imx.to/abc"))).toBe(false);
  });
});

describe("imxResolver.fromThumbnail", () => {
  it("swaps /u/t/ for /u/i/ on imx thumbnails", () => {
    expect(imxResolver.fromThumbnail?.("https://image.imx.to/u/t/x.jpg")).toBe(
      "https://image.imx.to/u/i/x.jpg",
    );
  });

  it("returns null for non-thumbnail imx URLs", () => {
    expect(imxResolver.fromThumbnail?.("https://image.imx.to/u/i/x.jpg")).toBeNull();
    expect(imxResolver.fromThumbnail?.("https://imx.to/i/abc")).toBeNull();
  });

  it("returns null for non-imx hosts", () => {
    expect(imxResolver.fromThumbnail?.("https://example.com/u/t/x.jpg")).toBeNull();
  });
});

describe("imxResolver.resolveFromViewer", () => {
  it("POSTs imgContinue and extracts the direct image URL", async () => {
    await withMockFetch(
      async () => ({
        ok: true,
        text: async () => '<html><body><img src="https://image.imx.to/u/i/x.jpg"></body></html>',
      }),
      async () => {
        const result = await imxResolver.resolveFromViewer("https://imx.to/i/abc");
        expect(result).toEqual({ url: "https://image.imx.to/u/i/x.jpg" });
      },
    );
  });

  it("includes the filename parsed from the page <title>", async () => {
    await withMockFetch(
      async () => ({
        ok: true,
        text: async () => `
          <html>
            <head><title> IMX.to / 17944566_tyg186_002.jpg </title></head>
            <body><img src="https://image.imx.to/u/i/x.jpg"></body>
          </html>`,
      }),
      async () => {
        const result = await imxResolver.resolveFromViewer("https://imx.to/i/abc");
        expect(result).toEqual({
          url: "https://image.imx.to/u/i/x.jpg",
          filename: "17944566_tyg186_002.jpg",
        });
      },
    );
  });

  it("throws a transient error on a 5xx POST response", async () => {
    await withMockFetch(
      async () => ({ ok: false, status: 503 }),
      async () => {
        await expect(imxResolver.resolveFromViewer("https://imx.to/i/abc")).rejects.toThrow(
          "HTTP 503",
        );
      },
    );
  });

  it("throws (non-transient) when no image URL is present", async () => {
    await withMockFetch(
      async () => ({ ok: true, text: async () => "<html><body>nothing here</body></html>" }),
      async () => {
        await expect(imxResolver.resolveFromViewer("https://imx.to/i/abc")).rejects.toThrow(
          "DEAD_LINK: imx.to image not found",
        );
      },
    );
  });
});

describe("imagevenueResolver", () => {
  it("matches imagevenue.com and subdomains, rejects lookalikes", () => {
    expect(imagevenueResolver.matches(new URL("https://imagevenue.com/x"))).toBe(true);
    expect(imagevenueResolver.matches(new URL("https://www.imagevenue.com/x"))).toBe(true);
    expect(imagevenueResolver.matches(new URL("https://imagevenue.com.evil.com/x"))).toBe(false);
  });

  it("has no thumbnail shortcut", () => {
    expect(imagevenueResolver.fromThumbnail).toBeUndefined();
  });

  it("self-primes the cookie (no-store) then reads the real page (reload)", async () => {
    const calls: { cache?: string }[] = [];
    await withMockFetch(
      async (_url, options) => {
        calls.push({ cache: options?.cache });
        return {
          ok: true,
          text: async () => `<img class="img-fluid" src="https://cdn-1.imagevenue.com/a.jpg">`,
        };
      },
      async () => {
        const r = await imagevenueResolver.resolveFromViewer("https://imagevenue.com/x");
        expect(r.url).toBe("https://cdn-1.imagevenue.com/a.jpg");
        expect(calls).toHaveLength(2);
        expect(calls[0]?.cache).toBe("no-store");
        expect(calls[1]?.cache).toBe("reload");
      },
    );
  });

  it("falls back to a cdn <img> src", async () => {
    await withMockFetch(
      async () => ({
        ok: true,
        text: async () => `<img src="https://cdn-2.imagevenue.com/b.png">`,
      }),
      async () => {
        const r = await imagevenueResolver.resolveFromViewer("https://imagevenue.com/x");
        expect(r.url).toBe("https://cdn-2.imagevenue.com/b.png");
      },
    );
  });

  it("falls back to og:image", async () => {
    await withMockFetch(
      async () => ({
        ok: true,
        text: async () => `<meta property="og:image" content="https://img.example.com/o.jpg">`,
      }),
      async () => {
        const r = await imagevenueResolver.resolveFromViewer("https://imagevenue.com/x");
        expect(r.url).toBe("https://img.example.com/o.jpg");
      },
    );
  });

  it("throws a transient error on a 5xx read response", async () => {
    await withMockFetch(
      async (_url, options) =>
        options?.cache === "reload"
          ? { ok: false, status: 502 }
          : { ok: true, text: async () => "" },
      async () => {
        await expect(
          imagevenueResolver.resolveFromViewer("https://imagevenue.com/x"),
        ).rejects.toThrow("HTTP 502");
      },
    );
  });

  it("throws (non-transient) when no image can be extracted", async () => {
    await withMockFetch(
      async () => ({ ok: true, text: async () => "<html><body>interstitial</body></html>" }),
      async () => {
        await expect(
          imagevenueResolver.resolveFromViewer("https://imagevenue.com/x"),
        ).rejects.toThrow("Failed to extract");
      },
    );
  });
});

describe("resolveLeaf", () => {
  it("dispatches imx.to to the imx resolver", async () => {
    await withMockFetch(
      async () => ({ ok: true, text: async () => `<img src="https://image.imx.to/u/i/z.jpg">` }),
      async () => {
        const r = await resolveLeaf("https://imx.to/i/z");
        expect(r.url).toBe("https://image.imx.to/u/i/z.jpg");
      },
    );
  });

  it("throws an explicit error for unsupported hosts", async () => {
    await expect(resolveLeaf("https://example.com/image")).rejects.toThrow(
      "no leaf resolver for host: example.com",
    );
  });

  it("rejects an invalid URL", async () => {
    await expect(resolveLeaf("not-a-url")).rejects.toThrow();
  });
});

describe("thumbnailToFull", () => {
  it("transforms imx thumbnails", () => {
    expect(thumbnailToFull("https://imx.to/u/t/2026/04/27/abc.jpg")).toBe(
      "https://imx.to/u/i/2026/04/27/abc.jpg",
    );
  });

  it("returns null for imagevenue thumbnails (no shortcut)", () => {
    expect(thumbnailToFull("https://imagevenue.com/u/t/x.jpg")).toBeNull();
  });

  it("returns null for unknown hosts and invalid URLs", () => {
    expect(thumbnailToFull("https://other.com/u/t/x.jpg")).toBeNull();
    expect(thumbnailToFull("not-a-url")).toBeNull();
  });
});
