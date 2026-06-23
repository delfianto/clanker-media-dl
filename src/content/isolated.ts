import browser from "webextension-polyfill";
import type { MDConfig, Settings } from "../types/global";
import type { HosterModel } from "../types/hoster";
import type {
  MDBlobResult,
  MDFetchBlobRequest,
  MDFetchBlobResponse,
  MDMainRequest,
  MDMainResponse,
} from "../types/messages";
import { ALL_MODELS } from "../hosts/index";
import { DEFAULT_SETTINGS } from "../settings/schema";

// ISOLATED world, document_idle, on viewer pages. Responsibilities:
//   1. resolve which hoster this page belongs to and whether it's enabled,
//   2. inject the user's CSS overrides,
//   3. hand the matched hoster id to the MAIN world (CustomEvent bridge),
//   4. relay MAIN's fetch requests to the SW and post the bytes back.

// MV3 match pattern → anchored RegExp (concrete hosts + trailing /* only).
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchModel(href: string, pathname: string): HosterModel | undefined {
  return ALL_MODELS.find((model) => {
    if (!model.viewerMatches.some((p) => patternToRegex(p).test(href))) return false;
    const guard = model.downloadConfig.pathGuard;
    return guard ? new RegExp(guard).test(pathname) : true;
  });
}

function injectCss(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  (document.head ?? document.documentElement).appendChild(style);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function onMainMessage(event: MessageEvent): void {
  if (event.source !== window) return;
  const data = event.data as Partial<MDMainRequest>;
  if (data.type !== "MD_REQUEST" || typeof data.id !== "string" || typeof data.url !== "string") {
    return;
  }
  void relay(data.id, data.url);
}

async function relay(id: string, url: string): Promise<void> {
  let result: MDBlobResult;
  try {
    const request: MDFetchBlobRequest = { type: "MD_FETCH_BLOB", url };
    const res = (await browser.runtime.sendMessage(request)) as MDFetchBlobResponse;
    result =
      "error" in res
        ? { error: res.error }
        : { buffer: base64ToBuffer(res.base64), contentType: res.contentType };
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) };
  }

  const response: MDMainResponse = { type: "MD_RESPONSE", id, result };
  if ("buffer" in result) {
    // Transfer the ArrayBuffer zero-copy across the ISOLATED → MAIN boundary.
    window.postMessage(response, "*", [result.buffer]);
  } else {
    window.postMessage(response, "*");
  }
}

async function init(): Promise<void> {
  let settings: Settings;
  try {
    settings = (await browser.storage.local.get(DEFAULT_SETTINGS)) as Settings;
  } catch {
    settings = DEFAULT_SETTINGS;
  }
  if (!settings.enabled) return;

  const model = matchModel(location.href, location.pathname);
  if (!model) return;

  const override = settings.hosters[model.id];
  if (!override.enabled) return;

  if (override.cssOverrides) injectCss(override.cssOverrides);

  // Relay must be live before MAIN can issue a fetch request.
  window.addEventListener("message", onMainMessage);

  // Deliver the matched hoster id to main.ts. The CustomEvent crosses the
  // ISOLATED → MAIN boundary without tripping CSP (a DOM event is not script
  // execution); main.ts registers its listener synchronously at load, before
  // this async path resumes past the storage await.
  const config: MDConfig = { hosterId: model.id };
  document.dispatchEvent(new CustomEvent("__md_config__", { detail: JSON.stringify(config) }));
}

void init().catch(() => {});
