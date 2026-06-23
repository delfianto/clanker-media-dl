import type { HosterModel } from "../../types/hoster";

export const imgboxModel: HosterModel = {
  id: "imgbox",
  displayName: "ImgBox",
  viewerMatches: ["https://imgbox.com/*"],
  cdnMatches: ["https://thumbs*.imgbox.com/*", "https://images*.imgbox.com/*"],
  defaultRedirectRules: [
    {
      id: "imgbox-main",
      description: "Thumbnail/image CDN redirect",
      pattern:
        "^https?://(?:thumbs|images)\\d+\\.imgbox\\.com(?:/[a-f0-9]{2}){2}/([a-zA-Z0-9]{8,})_[bot]\\.(gif|jpe?g|png)$",
      template: "https://imgbox.com/$1",
      enabled: true,
    },
  ],
  downloadConfig: {
    buttonSelector: ".icon-cloud-download",
    imageSelector: "#img",
    filenameStrategy: { type: "dom", selector: ".image-content", attr: "title" },
    uiMode: "button-overlay",
    pathGuard: "^/[a-zA-Z0-9]{8}$",
  },
  defaultCssOverrides: "",
};
