// Shared download-feedback UI, replacing the three ad-hoc spinners from the
// userscripts. One idempotent <style> injection; everything else is class
// toggles on a small spinner + status element.

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
    .md-feedback { display: none; vertical-align: middle; margin-left: 10px; }
    .md-feedback.md-active { display: inline-flex; align-items: center; gap: 6px; }
    .md-spinner {
      width: 16px; height: 16px; flex: none; display: inline-block;
      border: 3px solid rgba(127, 127, 127, 0.35); border-top-color: #3498db;
      border-radius: 50%; animation: md-spin 0.8s linear infinite;
    }
    .md-status { font-weight: 600; vertical-align: middle; transition: opacity 0.5s ease-out; }
    .md-status.md-success { color: #2ecc71; }
    .md-status.md-error { color: #e74c3c; }
    .md-feedback.md-fade { opacity: 0; }
    .md-btn-busy { pointer-events: none; opacity: 0.6; }
    @keyframes md-spin { to { transform: rotate(360deg); } }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

type Parts = { container: HTMLElement; spinner: HTMLElement; status: HTMLElement };

function makeParts(): Parts {
  const container = document.createElement("span");
  container.className = "md-feedback";
  const spinner = document.createElement("span");
  spinner.className = "md-spinner";
  const status = document.createElement("span");
  status.className = "md-status";
  container.append(spinner, status);
  return { container, spinner, status };
}

function controller({ container, spinner, status }: Parts): DownloadUI {
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer(): void {
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  }

  function show(text: string, kind: "" | "success" | "error", spinning: boolean): void {
    clearTimer();
    container.classList.add("md-active");
    container.classList.remove("md-fade");
    spinner.style.display = spinning ? "inline-block" : "none";
    status.textContent = text;
    status.classList.toggle("md-success", kind === "success");
    status.classList.toggle("md-error", kind === "error");
  }

  function scheduleHide(delay: number): void {
    clearTimer();
    hideTimer = setTimeout(() => {
      container.classList.add("md-fade");
      hideTimer = setTimeout(() => container.classList.remove("md-active", "md-fade"), 500);
    }, delay);
  }

  return {
    showSpinner(message = "Downloading…"): void {
      show(message, "", true);
    },
    showSuccess(message = "Downloaded!"): void {
      show(message, "success", false);
      scheduleHide(1500);
    },
    showError(message = "Download failed"): void {
      show(message, "error", false);
      scheduleHide(2500);
    },
    reset(): void {
      clearTimer();
      container.classList.remove("md-active", "md-fade");
      status.textContent = "";
    },
  };
}

// imagebam: a spinner + status text inserted right after the filename element.
export function createInlineUI(anchorEl: HTMLElement): DownloadUI {
  ensureStyles();
  const parts = makeParts();
  anchorEl.after(parts.container);
  return controller(parts);
}

// imgbox / imgbb: dim the button while busy and show status text beside it.
export function createButtonUI(buttonEl: HTMLElement): DownloadUI {
  ensureStyles();
  const parts = makeParts();
  buttonEl.after(parts.container);
  const base = controller(parts);
  return {
    showSpinner(message): void {
      buttonEl.classList.add("md-btn-busy");
      base.showSpinner(message);
    },
    showSuccess(message): void {
      buttonEl.classList.remove("md-btn-busy");
      base.showSuccess(message);
    },
    showError(message): void {
      buttonEl.classList.remove("md-btn-busy");
      base.showError(message);
    },
    reset(): void {
      buttonEl.classList.remove("md-btn-busy");
      base.reset();
    },
  };
}
