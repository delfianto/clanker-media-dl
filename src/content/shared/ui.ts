// Shared download-feedback UI. One idempotent <style> injection; everything
// else is class toggles or innerHTML swaps on the button element.

export interface DownloadUI {
  showSpinner(message?: string): void;
  showSuccess(message?: string): void;
  showError(message?: string): void;
  reset(): void;
}

const STYLE_ID = "md-ui-styles";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .md-btn-busy { pointer-events: none; opacity: 0.6; }
    .md-inline-spinner {
      display: inline-block; width: 14px; height: 14px;
      border: 2px solid rgba(127,127,127,0.35); border-top-color: currentColor;
      border-radius: 50%; animation: md-spin 0.8s linear infinite;
      vertical-align: middle;
    }
    .md-icon-group { display: inline-flex; gap: 2px; align-items: center; vertical-align: middle; }
    .md-icon-btn {
      background: transparent; border: none; color: inherit;
      padding: 4px 7px; border-radius: 4px; cursor: pointer;
      font-size: 14px; line-height: 1; opacity: 0.65;
      transition: opacity 0.15s, background 0.15s;
    }
    .md-icon-btn:hover { opacity: 1; background: rgba(127,127,127,0.12); }
    .md-icon-btn.md-btn-busy { pointer-events: none; opacity: 0.35; }
    @keyframes md-spin { to { transform: rotate(360deg); } }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

// Swaps the button's inner HTML with a spinner while downloading, then
// restores it. Works for both the imgbox icon anchor and the imagebam
// injected buttons — no side text, no separate status element.
export function createIconSwapUI(buttonEl: HTMLElement): DownloadUI {
  ensureStyles();
  const savedHTML = buttonEl.innerHTML;

  return {
    showSpinner(): void {
      buttonEl.classList.add("md-btn-busy");
      buttonEl.innerHTML = '<span class="md-inline-spinner"></span>';
    },
    showSuccess(): void {
      buttonEl.classList.remove("md-btn-busy");
      buttonEl.innerHTML = savedHTML;
    },
    showError(): void {
      buttonEl.classList.remove("md-btn-busy");
      buttonEl.innerHTML = savedHTML;
    },
    reset(): void {
      buttonEl.classList.remove("md-btn-busy");
      buttonEl.innerHTML = savedHTML;
    },
  };
}
