import type { HosterId, HosterModel } from "../types/hoster";
import { imagebamModel } from "./imagebam/model";
import { imgboxModel } from "./imgbox/model";
import { imgbbModel } from "./imgbb/model";

// Every hoster the extension knows about. The redirector iterates this; the
// popup uses it to render the hoster list and detect the active page.
export const ALL_MODELS: HosterModel[] = [imagebamModel, imgboxModel, imgbbModel];

export function getModel(id: HosterId): HosterModel | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}
