import { describe, expect, it } from "bun:test";
import { sanitizeFilename } from "../sanitize";

describe("sanitizeFilename", () => {
  it("keeps normal filenames intact", () => {
    expect(sanitizeFilename("image.jpg")).toBe("image.jpg");
    expect(sanitizeFilename("album_cover_1.png")).toBe("album_cover_1.png");
    expect(sanitizeFilename("My Cool Photo.jpeg")).toBe("My Cool Photo.jpeg");
  });

  it("replaces illegal Windows characters with underscores", () => {
    expect(sanitizeFilename("file/name.jpg")).toBe("file_name.jpg");
    expect(sanitizeFilename("file\\name.jpg")).toBe("file_name.jpg");
    expect(sanitizeFilename("file:name.jpg")).toBe("file_name.jpg");
    expect(sanitizeFilename("file*name.jpg")).toBe("file_name.jpg");
    expect(sanitizeFilename("file?name.jpg")).toBe("file_name.jpg");
    expect(sanitizeFilename('file"name.jpg')).toBe("file_name.jpg");
    expect(sanitizeFilename("file<name>.jpg")).toBe("file_name_.jpg");
    expect(sanitizeFilename("file|name.jpg")).toBe("file_name.jpg");
  });

  it("collapses multiple illegal characters into a single underscore", () => {
    expect(sanitizeFilename("file///name.jpg")).toBe("file_name.jpg");
    expect(sanitizeFilename("what???:*file.png")).toBe("what_file.png");
  });

  it("removes control characters entirely", () => {
    expect(sanitizeFilename("file\x00name.jpg")).toBe("filename.jpg");
    expect(sanitizeFilename("file\x1fname.jpg")).toBe("filename.jpg");
    expect(sanitizeFilename("file\nname.jpg")).toBe("filename.jpg");
  });

  it("trims leading and trailing spaces, dots, and hyphens", () => {
    expect(sanitizeFilename("  image.jpg  ")).toBe("image.jpg");
    expect(sanitizeFilename("..image.jpg..")).toBe("image.jpg");
    expect(sanitizeFilename(".-_image.jpg_-.")).toBe("image.jpg");
    // Should trim them even if exposed after replacing illegal chars
    expect(sanitizeFilename("?  image.jpg  ?")).toBe("image.jpg");
  });

  it("truncates long filenames to 100 characters while preserving the extension", () => {
    const longName = "a".repeat(150) + ".jpg";
    const sanitized = sanitizeFilename(longName);
    expect(sanitized.length).toBe(100);
    expect(sanitized.endsWith(".jpg")).toBe(true);
    expect(sanitized.startsWith("a".repeat(96))).toBe(true);
  });

  it("truncates long filenames without extensions to 100 characters", () => {
    const longName = "a".repeat(150);
    const sanitized = sanitizeFilename(longName);
    expect(sanitized.length).toBe(100);
    expect(sanitized).toBe("a".repeat(100));
  });

  it("preserves extensions up to 10 characters during truncation", () => {
    const longName = "a".repeat(150) + ".jpeg12345";
    const sanitized = sanitizeFilename(longName);
    expect(sanitized.length).toBe(100);
    expect(sanitized.endsWith(".jpeg12345")).toBe(true);
  });

  it("does not preserve extensions longer than 10 characters during truncation", () => {
    const longName = "a".repeat(150) + ".thisextensionistoolong";
    const sanitized = sanitizeFilename(longName);
    expect(sanitized.length).toBe(100);
    // It should just truncate the whole thing at 100
    expect(sanitized).toBe(("a".repeat(150) + ".thisextensionistoolong").slice(0, 100));
  });

  it("re-trims exposed trailing characters after truncation", () => {
    // If truncation cuts it such that the last character is a dot or space, it should be removed.
    // Length is 100, but index 99 is a space.
    const longName = "a".repeat(99) + " " + "b".repeat(50);
    const sanitized = sanitizeFilename(longName);
    expect(sanitized.length).toBe(99);
    expect(sanitized).toBe("a".repeat(99));
  });
});
