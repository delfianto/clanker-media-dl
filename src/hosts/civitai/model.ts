import type { HosterModel } from "../../types/hoster";

export const civitaiModel: HosterModel = {
  id: "civitai",
  displayName: "Civitai",
  // Start on every route: opening/closing a carousel need not navigate, and
  // Next.js can enter a model page from the homepage without a document load.
  viewerMatches: ["https://civitai.com/*", "https://civitai.red/*"],
  cdnMatches: [],
  defaultRedirectRules: [],
  downloadConfig: {
    buttonSelector: "",
    filenameStrategy: { type: "url-slug" },
    uiMode: "button-overlay",
  },
  defaultCssOverrides: "",
  hostPermissions: [
    "https://civitai.com/*",
    "https://civitai.red/*",
    "https://image.civitai.com/*",
    "https://blobs-b2.civitai.com/*",
  ],
};
