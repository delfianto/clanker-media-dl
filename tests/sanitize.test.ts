import { describe, it, expect } from "bun:test";
import { sanitizeFilename } from "../src/background/sanitize";

describe("sanitizeFilename", () => {
  describe("replaces Windows-illegal characters", () => {
    it("replaces forward slash", () => {
      expect(sanitizeFilename("path/to/file.jpg")).toBe("path_to_file.jpg");
    });

    it("replaces backslash", () => {
      expect(sanitizeFilename("path\\to\\file.jpg")).toBe("path_to_file.jpg");
    });

    it("replaces colon", () => {
      expect(sanitizeFilename("photo: 2024.jpg")).toBe("photo_ 2024.jpg");
    });

    it("replaces asterisk", () => {
      expect(sanitizeFilename("img*.png")).toBe("img_.png");
    });

    it("replaces question mark", () => {
      expect(sanitizeFilename("what?.jpg")).toBe("what_.jpg");
    });

    it("replaces double quote", () => {
      expect(sanitizeFilename('say "hi".jpg')).toBe("say _hi_.jpg");
    });

    it("replaces angle brackets", () => {
      expect(sanitizeFilename("img<1>.png")).toBe("img_1_.png");
    });

    it("replaces pipe", () => {
      expect(sanitizeFilename("a|b.jpg")).toBe("a_b.jpg");
    });
  });

  describe("replaces control characters", () => {
    it("strips null bytes", () => {
      expect(sanitizeFilename("file\x00name.jpg")).toBe("filename.jpg");
    });

    it("strips tab", () => {
      expect(sanitizeFilename("file\tname.jpg")).toBe("filename.jpg");
    });

    it("strips newline", () => {
      expect(sanitizeFilename("file\nname.jpg")).toBe("filename.jpg");
    });
  });

  describe("handles edge cases", () => {
    it("trims leading/trailing spaces", () => {
      expect(sanitizeFilename("  photo.jpg  ")).toBe("photo.jpg");
    });

    it("trims leading/trailing dots", () => {
      expect(sanitizeFilename("..photo.jpg..")).toBe("photo.jpg");
    });

    it("collapses consecutive underscores", () => {
      expect(sanitizeFilename("a///b.jpg")).toBe("a_b.jpg");
    });

    it("returns 'file' for empty input", () => {
      expect(sanitizeFilename("")).toBe("file");
    });

    it("reduces all-illegal input to single underscore", () => {
      expect(sanitizeFilename("///")).toBe("_");
    });

    it("returns 'file' when only spaces and dots", () => {
      expect(sanitizeFilename("  .  ")).toBe("file");
    });
  });

  describe("preserves valid filenames", () => {
    it("keeps simple ASCII", () => {
      expect(sanitizeFilename("photo123.jpg")).toBe("photo123.jpg");
    });

    it("keeps spaces in the middle", () => {
      expect(sanitizeFilename("my photo.jpg")).toBe("my photo.jpg");
    });

    it("keeps CJK characters", () => {
      expect(sanitizeFilename("\u5e03\u4e01\u5927\u6cd5.jpg")).toBe("\u5e03\u4e01\u5927\u6cd5.jpg");
    });

    it("keeps Japanese characters", () => {
      expect(sanitizeFilename("\u30eb\u30e0\u9152.mp4")).toBe("\u30eb\u30e0\u9152.mp4");
    });

    it("keeps Korean characters", () => {
      expect(sanitizeFilename("\uc774\uc5f0\uc6b0.mp4")).toBe("\uc774\uc5f0\uc6b0.mp4");
    });

    it("keeps parentheses", () => {
      expect(sanitizeFilename("img(1).jpg")).toBe("img(1).jpg");
    });

    it("keeps ampersand", () => {
      expect(sanitizeFilename("a&b.jpg")).toBe("a&b.jpg");
    });

    it("keeps brackets", () => {
      expect(sanitizeFilename("[45P 5V].jpg")).toBe("[45P 5V].jpg");
    });

    it("keeps multiple dots", () => {
      expect(sanitizeFilename("my.photo.v2.png")).toBe("my.photo.v2.png");
    });

    it("keeps hyphens and underscores", () => {
      expect(sanitizeFilename("Yeonwoo-Oil-127_X7hqf7nk.jpg")).toBe("Yeonwoo-Oil-127_X7hqf7nk.jpg");
    });
  });
});
