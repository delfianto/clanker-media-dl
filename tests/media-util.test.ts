import { describe, it, expect } from "bun:test";
import { isMediaFile, isTransientError } from "../src/background/media-util";

describe("isMediaFile", () => {
  describe("detects video files", () => {
    it.each(["video.mp4", "clip.mov", "movie.mkv", "trailer.webm", "old.avi"])(
      "%s is media",
      (name) => {
        expect(isMediaFile(name)).toBe(true);
      },
    );
  });

  describe("detects audio files", () => {
    it.each(["song.mp3", "track.flac", "voice.aac", "sound.ogg", "note.m4a"])(
      "%s is media",
      (name) => {
        expect(isMediaFile(name)).toBe(true);
      },
    );
  });

  describe("rejects image files", () => {
    it.each(["photo.jpg", "image.png", "anim.gif", "pic.webp", "shot.jpeg"])(
      "%s is NOT media",
      (name) => {
        expect(isMediaFile(name)).toBe(false);
      },
    );
  });

  describe("rejects non-media", () => {
    it("rejects no extension", () => {
      expect(isMediaFile("README")).toBe(false);
    });

    it("rejects unknown extension", () => {
      expect(isMediaFile("archive.zip")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isMediaFile("VIDEO.MP4")).toBe(true);
      expect(isMediaFile("Song.Mp3")).toBe(true);
    });
  });
});

describe("isTransientError", () => {
  it("flags SERVER_FAILED", () => {
    expect(isTransientError(new Error("download interrupted: SERVER_FAILED"))).toBe(true);
  });

  it("flags SERVER_CONTENT_LENGTH_MISMATCH", () => {
    expect(isTransientError("Error: download interrupted: SERVER_CONTENT_LENGTH_MISMATCH")).toBe(
      true,
    );
  });

  it("flags NETWORK_FAILED", () => {
    expect(isTransientError(new Error("NETWORK_FAILED"))).toBe(true);
  });

  it("flags CRASH", () => {
    expect(isTransientError(new Error("download interrupted: CRASH"))).toBe(true);
  });

  it("does not flag FILE_FAILED", () => {
    expect(isTransientError(new Error("download interrupted: FILE_FAILED"))).toBe(false);
  });

  it("does not flag USER_CANCELED", () => {
    expect(isTransientError(new Error("download canceled"))).toBe(false);
  });

  it("does not flag generic errors", () => {
    expect(isTransientError(new Error("something else"))).toBe(false);
  });

  it("handles non-Error inputs", () => {
    expect(isTransientError("SERVER_FAILED")).toBe(true);
    expect(isTransientError(42)).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});
