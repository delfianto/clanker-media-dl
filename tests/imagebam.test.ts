import { describe, it, expect } from "bun:test";
import { isBizarreName } from "../src/hosts/imagebam/model";

describe("isBizarreName", () => {
  describe("detects bizarre names", () => {
    it("flags UUID filenames", () => {
      expect(isBizarreName("a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg")).toBe(true);
    });

    it("flags UUID without extension", () => {
      expect(isBizarreName("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
    });

    it("flags mojibake characters (Latin-1 supplement range)", () => {
      expect(isBizarreName("54\u00d8\u00ff\u00bc\u00d6\u00d9\u00ba 69.jpg")).toBe(true);
    });

    it("flags soft hyphen", () => {
      expect(isBizarreName("test\u00adfile.jpg")).toBe(true);
    });

    it("flags replacement character", () => {
      expect(isBizarreName("test\uFFFDfile.jpg")).toBe(true);
    });

    it("flags empty base", () => {
      expect(isBizarreName(".jpg")).toBe(true);
    });

    it("flags empty string", () => {
      expect(isBizarreName("")).toBe(true);
    });

    it("flags real mojibake from imagebam gallery GA19E2", () => {
      // Exact codepoints from the live page: soft hyphens (\u00AD),
      // Latin-1 supplement (\u00D8 \u00FF \u00D6 \u00BA \u00DC \u00FB),
      // and box drawing (\u255D) — classic encoding mismatch garbage.
      const mojibake =
        "54\u00ad\u00d8\u00ff\u255d\u00ad\u00d8\u00d6\u00ba\u00ad\u00d8\u00d6\u00dc\u00ad\u00d8\u00d6\u00fb 69.jpg";
      expect(isBizarreName(mojibake)).toBe(true);
    });

    it("flags multiple real mojibake variants from GA19E2", () => {
      // Each variant from the gallery — all should be flagged.
      const variants = [
        "54\u00ad\u00d8\u00ff\u255d\u00ad\u00d8\u00d6\u00ba\u00ad\u00d8\u00d6\u00dc\u00ad\u00d8\u00d6\u00fb 69.jpg",
        "21\u00ad\u00d8\u00ff\u255d\u00ad\u00d8\u00d6\u00ba\u00ad\u00d8\u00d6\u00dc\u00ad\u00d8\u00d6\u00fb 69.jpg",
        "31\u00ad\u00d8\u00ff\u255d\u00ad\u00d8\u00d6\u00ba\u00ad\u00d8\u00d6\u00dc\u00ad\u00d8\u00d6\u00fb 69.jpg",
        "55\u00ad\u00d8\u00ff\u255d\u00ad\u00d8\u00d6\u00ba\u00ad\u00d8\u00d6\u00dc\u00ad\u00d8\u00d6\u00fb 69.jpg",
      ];
      for (const name of variants) {
        expect(isBizarreName(name)).toBe(true);
      }
    });
  });

  describe("passes through normal names", () => {
    it("keeps simple ASCII filenames", () => {
      expect(isBizarreName("photo123.jpg")).toBe(false);
    });

    it("keeps filenames with spaces and numbers", () => {
      expect(isBizarreName("IMG 0042 final.png")).toBe(false);
    });

    it("keeps CJK filenames", () => {
      expect(isBizarreName("\u5e03\u4e01\u5927\u6cd5.jpg")).toBe(false);
    });

    it("keeps Japanese filenames", () => {
      expect(isBizarreName("\u30eb\u30e0\u9152.jpg")).toBe(false);
    });

    it("keeps Korean filenames", () => {
      expect(isBizarreName("\uc774\uc5f0\uc6b0.mp4")).toBe(false);
    });

    it("keeps filenames with mixed CJK and Latin", () => {
      expect(isBizarreName("Yeonwoo-Oil-127.jpg")).toBe(false);
    });

    it("keeps filenames with no extension", () => {
      expect(isBizarreName("README")).toBe(false);
    });

    it("keeps filenames with multiple dots", () => {
      expect(isBizarreName("my.photo.v2.png")).toBe(false);
    });

    it("keeps uppercase hex that is NOT a UUID", () => {
      expect(isBizarreName("ME2PNA7.jpg")).toBe(false);
    });
  });

  describe("fallback replacement (simulating collectResolveViewer)", () => {
    // Reproduces the logic in gallery-runner's collectResolveViewer:
    // when isBizarreName returns true, replace filename with file ID + ext.
    function applyFallback(filename: string, fileId: string): string {
      if (!isBizarreName(filename)) return filename;
      const dot = filename.lastIndexOf(".");
      const ext = dot >= 0 ? filename.slice(dot + 1) : "";
      return ext ? `${fileId}.${ext}` : fileId;
    }

    it("replaces real GA19E2 mojibake with file ID", () => {
      const mojibake =
        "54\u00ad\u00d8\u00ff\u255d\u00ad\u00d8\u00d6\u00ba\u00ad\u00d8\u00d6\u00dc\u00ad\u00d8\u00d6\u00fb 69.jpg";
      expect(applyFallback(mojibake, "ME2PNA7")).toBe("ME2PNA7.jpg");
    });

    it("does NOT replace proper ASCII filenames", () => {
      expect(applyFallback("photo123.jpg", "ME2PNA7")).toBe("photo123.jpg");
    });

    it("does NOT replace CJK filenames", () => {
      expect(applyFallback("\u5e03\u4e01\u5927\u6cd5.jpg", "ME2PNA7")).toBe(
        "\u5e03\u4e01\u5927\u6cd5.jpg",
      );
    });

    it("does NOT replace Japanese filenames", () => {
      expect(applyFallback("\u30eb\u30e0\u9152.mp4", "ME2PNA7")).toBe("\u30eb\u30e0\u9152.mp4");
    });

    it("does NOT replace Korean filenames", () => {
      expect(applyFallback("\uc774\uc5f0\uc6b0.mp4", "ME2PNA7")).toBe("\uc774\uc5f0\uc6b0.mp4");
    });

    it("replaces UUID filenames", () => {
      expect(applyFallback("a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg", "ME2PNA7")).toBe(
        "ME2PNA7.jpg",
      );
    });
  });
});
