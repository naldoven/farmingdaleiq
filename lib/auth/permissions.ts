import { createClient } from "@/lib/supabase/server";

/**
 * Every permission key seeded by supabase/migrations. Grouped by module so
 * later streams can find "their" keys quickly. UI hides what a role can't do;
 * RLS + requirePermission() below are what actually enforce it (see
 * ARCHITECTURE.md "Technical architecture" — has_permission(key) SQL helper).
 */
export const PERMISSION_KEYS = [
  // People & teams
  "people.manage",
  "people.view",
  "teams.manage",
  "roles.manage",

  // Checklists
  "checklists.manage_templates",
  "checklists.complete",
  "checklists.view_reports",

  // Tasks
  "tasks.manage",
  "tasks.complete",

  // Setups, shifts, layout
  "setups.manage",
  "setups.view",
  "setups.post",

  // Breaks
  "breaks.manage",
  "breaks.view",

  // Ratings
  "ratings.rate",
  "ratings.view",

  // Training / passports / trainee lifecycle
  "training.manage",
  "training.stamp",
  "training.view",
  "training.org_chart_manage",

  // Waste
  "waste.manage",
  "waste.log",

  // Accountability
  "accountability.manage",
  "accountability.issue",
  "accountability.view_own",

  // Tokens & rewards
  "tokens.manage",
  "tokens.award",
  "tokens.gift",
  "rewards.manage",
  "rewards.claim",
  "rewards.fulfill",

  // Team feed
  "feed.post_broadcast",
  "feed.post",

  // Vendors
  "vendors.manage",
  "vendors.view",

  // Maintenance
  "maintenance.manage",
  "maintenance.request",
  "maintenance.triage",

  // Catering
  "catering.manage",
  "catering.view",

  // Reporting
  "reports.view",

  // Settings / notifications / discord
  "settings.manage",
  "discord.manage",
  "notifications.view",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export class PermissionError extends Error {
  key: PermissionKey;

  constructor(key: PermissionKey) {
    super(`Missing permission: ${key}`);
    this.name = "PermissionError";
    this.key = key;
  }
}

/**
 * Checks the current user's permission via the has_permission(key) SQL
 * helper (defined in supabase/migrations). Returns false on any error
 * (including "not signed in") so callers fail closed.
 */
export async function hasPermission(key: PermissionKey): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    permission_key: key,
  });

  if (error) {
    return false;
  }

  return Boolean(data);
}

/**
 * Server-side guard for Server Actions and route handlers. Throws
 * PermissionError when the current user lacks `key`; callers should catch
 * this and return a user-facing error rather than let it bubble to a 500.
 *
 * UI hiding (disabling a button, hiding a nav link) is never sufficient on
 * its own — every mutating action must call this, and RLS must independently
 * enforce the same rule at the database layer.
 */
export async function requirePermission(key: PermissionKey): Promise<void> {
  if (!(await hasPermission(key))) {
    throw new PermissionError(key);
  }
}
