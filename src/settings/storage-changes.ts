import type { Settings } from "../types/global";
import { DEFAULT_SETTINGS } from "./schema";

type StorageChange = { newValue?: unknown };

// Storage events contain only changed keys. Retain the other settings and use
// defaults when a key is removed (including storage.local.clear()).
export function applyStorageChanges(
  settings: Settings,
  changes: Record<string, StorageChange>,
): Settings {
  const next = { ...settings };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const change = changes[key];
    if (!change) continue;
    Object.assign(next, { [key]: change.newValue ?? structuredClone(DEFAULT_SETTINGS[key]) });
  }
  next.hosters = { ...DEFAULT_SETTINGS.hosters, ...next.hosters };
  return next;
}
