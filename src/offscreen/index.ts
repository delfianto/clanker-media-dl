import browser from "webextension-polyfill";

browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as Record<string, unknown>;

  if (m["type"] === "MD_OFFSCREEN_DOWNLOAD") {
    const url = m["url"] as string;

    (async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        return { blobUrl };
      } catch (err) {
        console.error("[md-offscreen] Fetch/Blob URL creation failed:", err);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    })().then(sendResponse);

    return true; // Keep message channel open for asynchronous response
  }

  if (m["type"] === "MD_OFFSCREEN_CLEANUP") {
    const blobUrl = m["blobUrl"] as string;
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    return false;
  }

  return false;
});
