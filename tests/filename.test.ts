import { describe, it, expect } from "bun:test";
import { resolveUuidFallback } from "../src/content/shared/filename";

describe("resolveUuidFallback", () => {
  describe("when filename is a UUID", () => {
    it("replaces with file ID, keeping extension", () => {
      const result = resolveUuidFallback("a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg", "ME2PNA7");
      expect(result).toBe("ME2PNA7.jpg");
    });

    it("extracts numeric segment from v1-style file ID", () => {
      const result = resolveUuidFallback("a1b2c3d4-e5f6-7890-abcd-ef1234567890.png", "abcde123");
      expect(result).toBe("23.png");
    });

    it("handles UUID with no extension", () => {
      const result = resolveUuidFallback("a1b2c3d4-e5f6-7890-abcd-ef1234567890", "ME2PNA7");
      expect(result).toBe("ME2PNA7");
    });
  });

  describe("when filename is normal", () => {
    it("returns the original name unchanged", () => {
      expect(resolveUuidFallback("photo123.jpg", "ME2PNA7")).toBe("photo123.jpg");
    });

    it("returns CJK names unchanged", () => {
      expect(resolveUuidFallback("\u5e03\u4e01\u5927\u6cd5.jpg", "ME2PNA7")).toBe(
        "\u5e03\u4e01\u5927\u6cd5.jpg",
      );
    });

    it("returns mojibake names unchanged (not its job to detect)", () => {
      expect(resolveUuidFallback("54\u00d8\u00ff.jpg", "ME2PNA7")).toBe("54\u00d8\u00ff.jpg");
    });
  });
});
