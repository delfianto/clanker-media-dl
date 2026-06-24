import type { GalleryJobItem } from "../../types/messages";

const STYLE_ID = "md-gallery-styles";

// Shared gallery styles only — the generic fallback button + the spin keyframe
// used by all hosters' loading icons. Hoster-specific CSS lives in each
// adapter's activateGallery function so it's only injected on the site that
// needs it.
export function injectGalleryStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .md-gallery-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: #3b82f6; color: #fff; border: none;
      padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: background 0.15s, opacity 0.15s;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .md-gallery-btn:hover:not(:disabled) { background: #2563eb; }
    .md-gallery-btn:disabled { opacity: 0.55; cursor: default; }
    .md-gallery-btn-wrap {
      display: flex; align-items: center; gap: 10px;
      margin: 8px 0 12px;
    }
    .md-gallery-note { font-size: 11px; color: #71717a; }
    @keyframes md-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

// Inject hoster-specific CSS with a unique ID so it's only added once per page.
// Called by each adapter's activateGallery — keeps hoster styles scoped to the
// site that needs them instead of polluting every gallery page.
export function injectHosterStyles(id: string, css: string): void {
  const styleId = `md-${id}-styles`;
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = css;
  (document.head ?? document.documentElement).appendChild(style);
}

// Shared button-wiring helper. Each hoster's gallery adapter creates its own
// button element with hoster-specific HTML/placement, then calls this to wire
// up the click → triggerDownload + progress → reset pattern. Eliminates the
// copy-pasted progress listener that was in gallery-runner for each hoster.
export function wireGalleryButton(
  btn: HTMLElement,
  loadingIcon: string,
  doneIcon: string,
  triggerDownload: (btn: HTMLElement, loadingIcon: string, doneIcon: string) => Promise<string>,
): void {
  let activeJobId = "";
  btn.addEventListener("click", async () => {
    if (activeJobId) return;
    activeJobId = "loading";
    activeJobId = await triggerDownload(btn, loadingIcon, doneIcon);
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as Record<string, unknown>;
    if (data["type"] === "MD_JOB_PROGRESS" && data["jobId"] === activeJobId) {
      const status = data["status"];
      if (status === "done" || status === "error" || status === "canceled") {
        btn.innerHTML = doneIcon;
        btn.classList.remove("loading");
        activeJobId = "";
      }
    }
  });
}

// Context passed to each hoster's activateGallery function.
export type GalleryCtx = {
  items: GalleryJobItem[];
  subfolder: string;
  albumName: string;
  triggerDownload: (btn: HTMLElement, loadingIcon: string, doneIcon: string) => Promise<string>;
};

export function createDownloadAllButton(
  totalCount: number,
  note: string | undefined,
  onClick: () => void,
): HTMLElement {
  injectGalleryStyles();

  const btn = document.createElement("button");
  btn.className = "md-gallery-btn";
  btn.textContent = `⬇ Download All (${totalCount})`;

  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Queued…";
    onClick();
  });

  const wrap = document.createElement("div");
  wrap.className = "md-gallery-btn-wrap";
  wrap.appendChild(btn);

  if (note) {
    const noteEl = document.createElement("span");
    noteEl.className = "md-gallery-note";
    noteEl.textContent = note;
    wrap.appendChild(noteEl);
  }

  return wrap;
}
