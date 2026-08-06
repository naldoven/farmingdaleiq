/**
 * Reversible product switches for modules that remain in the repository but
 * must not be reachable, advertised, or run in the background right now.
 * Re-enabling a module is intentionally a one-line change here; its pages,
 * actions, database schema, and domain logic stay intact while dormant.
 */
export type AppFeature = "broadcast" | "breaks" | "setups";

export const APP_FEATURES: Readonly<Record<AppFeature, boolean>> = {
  broadcast: false,
  breaks: false,
  setups: false,
};

const PERMISSION_FEATURE: Readonly<Record<string, AppFeature>> = {
  "feed.post_broadcast": "broadcast",
  "breaks.manage": "breaks",
  "breaks.view": "breaks",
  "setups.manage": "setups",
  "setups.view": "setups",
  "setups.post": "setups",
};

const EVENT_FEATURE: Readonly<Record<string, AppFeature>> = {
  broadcast: "broadcast",
  break_overdue: "breaks",
  setup_posted: "setups",
};

/** Permissions unrelated to a dormant module remain available. */
export function isPermissionFeatureEnabled(permissionKey: string): boolean {
  const feature = PERMISSION_FEATURE[permissionKey];
  return feature ? APP_FEATURES[feature] : true;
}

/** Events owned by dormant modules must not fan out or create downstream work. */
export function isEventFeatureEnabled(eventKey: string): boolean {
  const feature = EVENT_FEATURE[eventKey];
  return feature ? APP_FEATURES[feature] : true;
}

/** Filters a typed event-key list without widening its element type. */
export function enabledEventKeys<T extends string>(keys: readonly T[]): T[] {
  return keys.filter(isEventFeatureEnabled);
}
