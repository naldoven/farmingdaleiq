import type { PermissionKey } from "@/lib/auth/permissions";

/**
 * The store setup registry (docs/STORE-SETUP.md). One entry per area of
 * store configuration that shipped as an Avondale guess (SEED-DEFAULT) or
 * as an ARCHITECTURE.md "Open question" a manager still has to answer.
 *
 * The Store setup page (/settings/setup) renders one row per entry and
 * reads store_setup_areas to decide "confirmed" vs "still default". Each
 * editor shows a "Default, not confirmed" tag off the same table. Keep this
 * list in step with docs/STORE-SETUP.md: the audit table there is the human
 * version of this file.
 *
 * Plain data, no React, no server imports, so it is unit-testable and safe
 * to import from a Client Component.
 */

export const STORE_SETUP_AREA_KEYS = [
  "positions",
  "waste_items",
  "token_rules",
  "rewards",
  "infractions",
  "role_permissions",
  "rating_rubrics",
  "onboarding_roadmap",
  "passports",
  "org_chart",
  "equipment_pm",
  "catering_menu",
  "catering_checklists",
  "discord",
] as const;

export type StoreSetupAreaKey = (typeof STORE_SETUP_AREA_KEYS)[number];

export interface StoreSetupArea {
  key: StoreSetupAreaKey;
  title: string;
  /** What the seed guessed and what the manager has to check. Reads on a phone. */
  description: string;
  /** Route of the editor that changes this area today, or null when none exists yet. */
  href: string | null;
  /** Permission the editor's writes require. */
  editPermission: PermissionKey;
  /** Costs, prices, token amounts: a shift leader must not be able to change these. */
  money: boolean;
  /** Where the default came from, for the audit trail. */
  source: string;
}

export const STORE_SETUP_AREAS: readonly StoreSetupArea[] = [
  {
    key: "positions",
    title: "Positions and groups",
    description:
      "The Avondale station list (Front Counter, Drive Thru, Dining Room, Kitchen, BOH Support). Ratings and setups use it. Check the names match how Farmingdale runs.",
    href: "/settings/positions",
    editPermission: "settings.manage",
    money: false,
    source: "app/(app)/setups/templates/constants.ts and the training seed",
  },
  {
    key: "waste_items",
    title: "Waste items and costs",
    description:
      "Item names came from the KitchenIQ screenshots. Twelve items carry a $0.10 placeholder cost, and the soups are priced per ounce but look like per-cup prices. Fix the costs.",
    href: "/waste?tab=admin",
    editPermission: "waste.manage",
    money: true,
    source: "supabase/migrations/20260709010000_seed_waste_items.sql",
  },
  {
    key: "token_rules",
    title: "Token earning rules",
    description:
      "Task and checklist completions pay 5 tokens each, Top Performer pays 20. All three are placeholders.",
    href: "/tokens",
    editPermission: "tokens.manage",
    money: true,
    source: "supabase/migrations/20260707001900_seed_store_config.sql",
  },
  {
    key: "rewards",
    title: "Rewards and prices",
    description:
      "The first seven rewards and prices are real KitchenIQ values. The rest of the list was never captured. Add what is missing.",
    href: "/rewards",
    editPermission: "rewards.manage",
    money: true,
    source: "supabase/migrations/20260707001900_seed_store_config.sql",
  },
  {
    key: "infractions",
    title: "Infraction types and ladder",
    description:
      "Points and the disciplinary ladder were corrected from KitchenIQ screenshots on 2026-09-26. Check nothing is missing below the last screenshot, then confirm.",
    href: "/accountability",
    editPermission: "accountability.manage",
    money: false,
    source: "supabase/migrations/20260926000000_accountability_confirmed_farmingdale_rules.sql",
  },
  {
    key: "role_permissions",
    title: "Role permissions",
    description:
      "Each role got a sensible cascading default (Team Member up to Location Manager). Check which roles can manage money, issue infractions, and change settings.",
    href: "/people/roles",
    editPermission: "roles.manage",
    money: false,
    source: "supabase/migrations/20260707001900_seed_store_config.sql",
  },
  {
    key: "rating_rubrics",
    title: "Rating rubrics",
    description:
      "No position has a 4-category rubric yet, so every station is quick-rate only. Decide which stations need the full rubric and name the categories.",
    href: null,
    editPermission: "training.manage",
    money: false,
    source: "ARCHITECTURE.md open question 5",
  },
  {
    key: "onboarding_roadmap",
    title: "Onboarding roadmap stations",
    description:
      "The FOH roadmap is the Avondale 21-station list in five phases. The kitchen roadmap is an empty placeholder. Trainee grids and schedules run off it.",
    href: "/training/grid",
    editPermission: "training.manage",
    money: false,
    source: "supabase/migrations/20260707020100_training_seed.sql",
  },
  {
    key: "passports",
    title: "Passports and pipelines",
    description:
      "Position passports are created automatically per position. The Masters and Leads pipelines use Avondale stage names and promote into Avondale roles. Check the stages and the target roles.",
    href: "/training",
    editPermission: "training.manage",
    money: false,
    source: "supabase/migrations/20260707020100_training_seed.sql",
  },
  {
    key: "org_chart",
    title: "Org chart tiers",
    description:
      "Five placeholder tiers with goal counts (Team Leaders 3, Shift Supervisors 2, and so on). Replace with Farmingdale's tiers and head counts.",
    href: "/people/org-chart",
    editPermission: "training.org_chart_manage",
    money: false,
    source: "supabase/migrations/20260707020100_training_seed.sql",
  },
  {
    key: "equipment_pm",
    title: "Equipment service schedules",
    description:
      "The equipment list was imported from the manuals. No preventive maintenance schedule exists yet (hood cleaning, filter changes). Add one per unit from its equipment page.",
    href: "/maintenance/equipment",
    editPermission: "maintenance.manage",
    money: false,
    source: "ARCHITECTURE.md open question 12",
  },
  {
    key: "catering_menu",
    title: "Catering menu and scaling rules",
    description:
      "Five starter items with made-up sauce, napkin, and cup scaling. Replace with Farmingdale's catering menu, prices, and how utensils scale per head.",
    href: "/catering/menu",
    editPermission: "catering.manage",
    money: true,
    source: "supabase/migrations/20260707040100_catering_seed.sql",
  },
  {
    key: "catering_checklists",
    title: "Catering stage checklists",
    description:
      "The confirm, setup, kitchen prep, and handoff checklists copy the Avondale Catering Hub. Edit the steps to match how Farmingdale runs an order.",
    href: "/catering/menu",
    editPermission: "catering.manage",
    money: false,
    source: "supabase/migrations/20260707040100_catering_seed.sql",
  },
  {
    key: "discord",
    title: "Discord channels",
    description:
      "No channels are set up until a manager pastes each webhook URL and routes events to it. Nothing posts to Discord before then.",
    href: "/settings/discord",
    editPermission: "discord.manage",
    money: false,
    source: "ARCHITECTURE.md open question 13",
  },
];

/**
 * Defaults that live in code, not the database. They have no editor, so the
 * Store setup page lists them read-only with the value and where it lives.
 * Changing one is a code change; the point here is that no SEED-DEFAULT is
 * invisible from the app.
 */
export interface CodeDefault {
  label: string;
  value: string;
  where: string;
  /** True when the owning module is switched off in lib/features.ts. */
  dormant: boolean;
}

export const CODE_DEFAULTS: readonly CodeDefault[] = [
  {
    label: "Catering re-book follow-up",
    value: "30 days after the event",
    where: "app/(app)/catering/logic.ts defaultFollowUpDueDate",
    dormant: false,
  },
  {
    label: "Waste spike alert",
    value: "1.5x the trailing 4-week average",
    where: "app/(app)/reports/logic.ts findWasteSpikes",
    dormant: false,
  },
  {
    label: "Near a disciplinary threshold",
    value: "within 2 points",
    where: "app/(app)/reports/logic.ts findEmployeesNearThreshold",
    dormant: false,
  },
  {
    label: "Repeat equipment failure",
    value: "2 or more work orders",
    where: "app/(app)/reports/logic.ts computeRepeatFailures",
    dormant: false,
  },
  {
    label: "Break overdue grace",
    value: "10 minutes",
    where: "lib/breaks/entitlement.ts OVERDUE_GRACE_MINUTES",
    dormant: true,
  },
  {
    label: "Minor break rule",
    value: "4 hours earns a 30-minute meal break (NY-law preset)",
    where: "supabase/migrations/20260707001900_seed_store_config.sql break_rules",
    dormant: true,
  },
  {
    label: "New hire badge window",
    value: "30 days",
    where: "lib/setups/badges.ts NEW_HIRE_WINDOW_DAYS",
    dormant: true,
  },
  {
    label: "Birthday badge window",
    value: "7 days",
    where: "lib/setups/badges.ts BIRTHDAY_WINDOW_DAYS",
    dormant: true,
  },
  {
    label: "Shift leader rank cutoff",
    value: "rank 6 (Team Leader) and above",
    where: "lib/setups/badges.ts LEADER_RANK_THRESHOLD",
    dormant: true,
  },
];

export function isStoreSetupAreaKey(value: string): value is StoreSetupAreaKey {
  return (STORE_SETUP_AREA_KEYS as readonly string[]).includes(value);
}

export function findStoreSetupArea(key: StoreSetupAreaKey): StoreSetupArea {
  const area = STORE_SETUP_AREAS.find((a) => a.key === key);
  if (!area) {
    // Every key in STORE_SETUP_AREA_KEYS has an entry; areas.test.ts pins that.
    throw new Error(`Unknown store setup area: ${key}`);
  }
  return area;
}

export type StoreSetupStatus = "confirmed" | "default";

export interface StoreSetupRow extends StoreSetupArea {
  status: StoreSetupStatus;
}

export interface StoreSetupSummary {
  rows: StoreSetupRow[];
  confirmedCount: number;
  defaultCount: number;
}

/**
 * Joins the registry with the set of confirmed keys. Unknown keys in the
 * confirmed set (an area that was later removed from the registry) are
 * ignored rather than rendered, so the page never shows a row it cannot
 * explain.
 */
export function summarizeStoreSetup(confirmedKeys: ReadonlySet<string>): StoreSetupSummary {
  const rows = STORE_SETUP_AREAS.map(
    (area): StoreSetupRow => ({
      ...area,
      status: confirmedKeys.has(area.key) ? "confirmed" : "default",
    }),
  );
  const confirmedCount = rows.filter((r) => r.status === "confirmed").length;
  return { rows, confirmedCount, defaultCount: rows.length - confirmedCount };
}
