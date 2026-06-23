import type { RedirectRule, HosterModel } from "../types/hoster";
import type { HosterOverride } from "../types/global";

// Merge a hoster's stored override with its model defaults to get the redirect
// rules that should actually run. redirectRules:null means the user hasn't
// customised them, so fall back to the model defaults. Either way, only enabled
// rules are returned.
export function effectiveRules(model: HosterModel, override: HosterOverride): RedirectRule[] {
  return (override.redirectRules ?? model.defaultRedirectRules).filter((r) => r.enabled);
}
