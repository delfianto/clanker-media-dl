const STYLE_ID = "md-ui-styles";

// Injects CSS for the imagebam icon button group. Idempotent.
export function injectButtonStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .md-icon-group { position: absolute; top: 8px; right: 0; display: inline-flex; gap: 2px; align-items: center; }
    .md-icon-btn { background: transparent; border: none; color: inherit; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 22px; line-height: 1; opacity: 0.65; transition: opacity 0.15s, background 0.15s; }
    .md-icon-btn:hover { opacity: 1; background: rgba(127,127,127,0.12); }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}
