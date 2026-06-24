import type { MDConfig } from "../../types/global";
import type { HosterModel } from "../../types/hoster";
import { requestDownloadSingle } from "./bridge";

// MAIN world. Ask the bridge to request a download via background SW.
export async function downloadBlob(
  url: string,
  filename: string,
  config?: MDConfig,
  model?: HosterModel,
): Promise<void> {
  let subfolder = "";
  if (config) {
    let albumName = "";
    if (model?.getGalleryName) {
      // The model owns all gallery-name resolution — including any secondary
      // page fetches (imagebam's "Back to gallery" link). The shared code just
      // awaits the result; no hoster-specific URL heuristics here.
      const detected = await model.getGalleryName(document);
      if (detected) albumName = detected;
    }
    if (config.autoFolderPerAlbum && albumName) {
      const safeName = albumName.replace(new RegExp('[/\\\\:*?"<>|]', "g"), "_").trim();
      subfolder = config.downloadDirectory ? `${config.downloadDirectory}/${safeName}` : safeName;
    } else {
      subfolder = config.downloadDirectory;
    }
  }

  const result = await requestDownloadSingle(url, filename, subfolder);
  if ("error" in result) throw new Error(result.error);
}
