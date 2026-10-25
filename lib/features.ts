/**
 * Reversible product switches for modules that can be taken out of reach
 * (pages 404, permissions leave the role editor, events stop fanning out,
 * crons answer 404) without deleting code or schema. All three were dormant
 * from 2026-08-06 and woken with readiness passes on 2026-10-25
 * (docs/*-RELEASE-READINESS.md). Turning one back off is the rollback lever
 * for that module, so the switches stay even while everything is on.
 */
export type AppFeature = "broadcast" | "breaks" | "setups";

export const APP_FEATURES: Readonly<Record<AppFeature, boolean>> = {
  // Woken 2026-10-25 (docs/BROADCAST-RELEASE-READINESS.md). A broadcast fans
  // out to every active employee as an in-app notification and, once a route
  // is configured, to Discord.
  broadcast: true,
  // Woken 2026-10-25 (docs/BREAKS-RELEASE-READINESS.md). Turning this on also
  // arms the /api/cron/breaks-overdue schedule in vercel.json.
  breaks: true,
  // Woken 2026-10-25 (docs/SETUPS-RELEASE-READINESS.md). Turning this on lets
  // setup_posted fan out again (notifications, Lead Duties tasks) and returns
  // lead_duty tasks to the task lists.
  setups: true,
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
