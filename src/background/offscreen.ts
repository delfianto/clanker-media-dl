import browser from "webextension-polyfill";
import { createOffscreenLifecycle } from "./offscreen-lifecycle";

type OffscreenApi = {
  createDocument: (options: {
    url: string;
    reasons: string[];
    justification: string;
  }) => Promise<void>;
  closeDocument: () => Promise<void>;
};

const offscreen = (browser as unknown as { offscreen?: OffscreenApi }).offscreen;

export async function hasOffscreenDocument(): Promise<boolean> {
  if (!offscreen) return false;
  if ("getContexts" in browser.runtime) {
    const contexts = await (browser.runtime as any).getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    return contexts.length > 0;
  }

  const clients = await (self as any).clients.matchAll();
  return clients.some((c: any) => c.url.includes("offscreen/index.html"));
}

const lifecycle = createOffscreenLifecycle({
  exists: hasOffscreenDocument,
  create: async () => {
    await offscreen?.createDocument({
      url: "src/offscreen/index.html",
      reasons: ["BLOBS"],
      justification: "Fetch media that requires a page context and keep active download jobs alive",
    });
  },
  close: async () => {
    await offscreen?.closeDocument();
  },
});

export async function ensureOffscreenDocument(): Promise<void> {
  // Firefox has no Chrome offscreen API; native downloads still work without
  // the Chrome keep-alive document.
  if (!offscreen) return;
  await lifecycle.ensure();
}

export async function closeOffscreenDocument(
  shouldClose: () => boolean = () => true,
): Promise<void> {
  if (!offscreen) return;
  await lifecycle.close(shouldClose);
}
