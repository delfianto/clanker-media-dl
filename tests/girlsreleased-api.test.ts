import { describe, it, expect } from "bun:test";
import { parseSet, deriveGalleryName } from "../src/hosts/girlsreleased/api";

describe("parseSet", () => {
  it("parses a full set with model and multiple files", () => {
    const parsed = parseSet({
      set: [
        147671,
        "Stranden",
        null,
        "errotica-archives.com",
        [
          [0, 0, 0, "https://imx.to/i/abc", "https://imx.to/u/t/x/abc.jpg", "img_001.jpg"],
          [
            0,
            0,
            0,
            "https://imagevenue.com/xyz",
            "https://imagevenue.com/t/xyz.jpg",
            "img_002.jpg",
          ],
        ],
        [[5208, "Deni"]],
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe("Stranden");
    expect(parsed?.site).toBe("errotica-archives.com");
    expect(parsed?.model).toBe("Deni");
    expect(parsed?.files).toHaveLength(2);
    expect(parsed?.files[0]).toEqual({
      viewerUrl: "https://imx.to/i/abc",
      thumbnailUrl: "https://imx.to/u/t/x/abc.jpg",
      filename: "img_001.jpg",
    });
  });

  it("keeps a set whose models element is absent (length 5)", () => {
    const parsed = parseSet({
      set: [
        1,
        "Set",
        null,
        "site.com",
        [[0, 0, 0, "https://imx.to/i/a", "https://imx.to/u/t/a.jpg", "a.jpg"]],
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.model).toBe("");
    expect(parsed?.files).toHaveLength(1);
  });

  it("tolerates an empty models array", () => {
    const parsed = parseSet({
      set: [
        1,
        "Set",
        null,
        "site.com",
        [[0, 0, 0, "https://imx.to/i/a", "https://imx.to/u/t/a.jpg", "a.jpg"]],
        [],
      ],
    });
    expect(parsed?.model).toBe("");
  });

  it("keeps a file with no originalFilename, deriving it from the viewer URL slug", () => {
    const parsed = parseSet({
      set: [
        1,
        "Set",
        null,
        "site.com",
        [[0, 0, 0, "https://imx.to/i/abc123", "https://imx.to/u/t/abc123.jpg"]],
        [],
      ],
    });
    expect(parsed?.files).toHaveLength(1);
    expect(parsed?.files[0]?.filename).toBe("abc123");
  });

  it("skips files lacking both viewer and thumbnail URLs", () => {
    const parsed = parseSet({
      set: [
        1,
        "Set",
        null,
        "site.com",
        [
          [0, 0, 0, "", "", ""],
          [0, 0, 0, "https://imx.to/i/ok", "https://imx.to/u/t/ok.jpg", "ok.jpg"],
        ],
        [],
      ],
    });
    expect(parsed?.files).toHaveLength(1);
    expect(parsed?.files[0]?.viewerUrl).toBe("https://imx.to/i/ok");
  });

  it("returns null for invalid shapes", () => {
    expect(parseSet(null)).toBeNull();
    expect(parseSet(undefined)).toBeNull();
    expect(parseSet("not an object")).toBeNull();
    expect(parseSet(42)).toBeNull();
    expect(parseSet({})).toBeNull();
    expect(parseSet({ set: "not an array" })).toBeNull();
    expect(parseSet({ set: [1, "name", null] })).toBeNull(); // too short (< 5)
    expect(parseSet({ set: [1, "name", null, "site", "files-not-array"] })).toBeNull();
  });
});

describe("deriveGalleryName", () => {
  it("combines site, model, and set name", () => {
    expect(deriveGalleryName("femjoy.com", "Ariel A", "Sway")).toBe("Femjoy/Ariel A - Sway");
  });

  it("omits the model segment when model is empty", () => {
    expect(deriveGalleryName("femjoy.com", "", "Sway")).toBe("Femjoy/Sway");
  });

  it("returns just the (cleaned) set name when site is empty", () => {
    expect(deriveGalleryName("", "", "Sway")).toBe("Sway");
    expect(deriveGalleryName("", "Model", "Sway")).toBe("Sway");
  });

  it("strips the TLD and capitalizes the site", () => {
    expect(deriveGalleryName("errotica-archives.com", "", "Set")).toBe("Errotica-archives/Set");
    expect(deriveGalleryName("met-art.com", "", "X")).toBe("Met-art/X");
  });

  it("normalizes slash separators in the set name to ' - '", () => {
    expect(deriveGalleryName("x.com", "", "A / B / C")).toBe("X/A - B - C");
  });
});
