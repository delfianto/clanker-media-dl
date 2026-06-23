import browser from "webextension-polyfill";
import type { MDFetchBlobRequest, MDFetchBlobResponse } from "../types/messages";
import { crossOriginFetchBlob } from "./fetcher";

// Service worker. Sole job: fetch image bytes from the extension's own
// (CORS-free) context and return them as { base64, contentType }. Returning a
// Promise from the listener tells webextension-polyfill to reply asynchronously.
browser.runtime.onMessage.addListener((msg: unknown): Promise<MDFetchBlobResponse> | undefined => {
  const message = msg as Partial<MDFetchBlobRequest>;
  if (message.type !== "MD_FETCH_BLOB" || typeof message.url !== "string") return undefined;

  return crossOriginFetchBlob(message.url).catch(
    (err: unknown): MDFetchBlobResponse => ({
      error: err instanceof Error ? err.message : String(err),
    }),
  );
});
