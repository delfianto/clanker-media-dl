import type { HosterId, RedirectRule } from "./hoster";

// Re-export so settings/options/popup code can import HosterId from "../types/global".
export type { HosterId } from "./hoster";

// Stored in browser.storage.local — user overrides ONLY. Defaults are never
// stored; they live in each HosterModel and are merged in at runtime
// (see settings/resolve.ts). This means new extension versions ship improved
// defaults to users who haven't overridden them.
export type HosterOverride = {
  enabled: boolean; // always stored (default true)
  redirectRules: RedirectRule[] | null; // null = "use model defaults"
  cssOverrides: string; // empty string = none
};

export type Settings = {
  enabled: boolean;
  hosters: Record<HosterId, HosterOverride>;
};

// Payload delivered from isolated.ts (ISOLATED, can read storage) to main.ts
// (MAIN, cannot) over the __md_config__ CustomEvent bridge. isolated.ts only
// dispatches when the extension + matched hoster are enabled, so the mere arrival
// of this event is the signal for main.ts to activate that hoster's adapter.
export type MDConfig = {
  hosterId: HosterId;
};
