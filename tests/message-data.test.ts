import { describe, expect, it } from "bun:test";
import { isMDMessage } from "../src/content/shared/message-data";

describe("page message boundary", () => {
  it("ignores null, undefined, primitives, arrays, and unrelated site messages", () => {
    for (const message of [
      null,
      undefined,
      "message",
      1,
      false,
      [],
      {},
      { type: 1 },
      { type: "civitai" },
    ]) {
      expect(isMDMessage(message)).toBe(false);
    }
  });

  it("accepts our protocol records for further field validation", () => {
    expect(isMDMessage({ type: "MD_GALLERY_START", jobId: "123" })).toBe(true);
    expect(isMDMessage({ type: "MD_JOB_PROGRESS", status: "done" })).toBe(true);
    expect(isMDMessage({ type: "MD_JOB_STATUS", jobId: "123" })).toBe(true);
  });
});
