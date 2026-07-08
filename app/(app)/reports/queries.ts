import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

/**
 * Typed, read-only data-fetch helpers for /reports (app/(app)/reports/page.tsx).
 * Split out of the page component so each permission-gated section can be
 * fetched with a plain `condition ? await fetchX(supabase) : null` -- a
 * ternary between "a typed object" and "null" type-checks cleanly, unlike a
 * ternary between two different `Promise.all([...])` tuple shapes.
 *
 * Every function here only ever calls `.select()` -- this module owns no
 * table and never writes to one it doesn't own (PLAN.md P2 item 2: "Read-
 * only over other modules' tables").
 */

type DB = SupabaseClient<Database>;

/**
 * Rolling window for the time-series report fetches. Reports are a store's
 * recent operational picture, not an all-time archive, so the high-volume
 * source tables (checklist runs/answers, token ledger, work orders) are
 * bounded to this window rather than selecting full history on every page
 * load (audit: "Reports fetches full history ... with no bound"). Slower-
 * moving, always-relevant sets (pending reward claims, the disciplinary
 * record whose lifetime counts matter) are intentionally left unbounded.
 */
const REPORT_WINDOW_DAYS = 180;

/** ISO cutoff `REPORT_WINDOW_DAYS` before now, for `.gte()` window filters. */
function reportWindowStart(now: Date = new Date()): string {
  const start = new Date(now);
  start.setDate(start.getDate() - REPORT_WINDOW_DAYS);
  return start.toISOString();
}

// ---------------------------------------------------------------------
// Base data: reports.view alone is enough (every table below has a
// select_authenticated RLS policy).
// ---------------------------------------------------------------------

export interface BaseReportData {
  profiles: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    due_at: string | null;
    assigned_user_id: string | null;
    assigned_position_id: string | null;
  }[];
  workOrders: { id: string; title: string; status: string; priority: string; due_at: string | null }[];
  equipment: { id: string; name: string; status: string; area: string | null }[];
  wasteEntries: { id: string; item_id: string; quantity: number; logged_at: string }[];
  wasteItems: { id: string; name: string; unit: string; unit_cost: number | null; category_id: string | null }[];
  wasteCategories: { id: string; name: string }[];
}

export async function fetchBaseReportData(supabase: DB): Promise<BaseReportData> {
  const [
    { data: profiles },
    { data: positions },
    { data: tasks },
    { data: workOrders },
    { data: equipment },
    { data: wasteEntries },
    { data: wasteItems },
    { data: wasteCategories },
  ] = await Promise.all([
    supabase.from("profiles").select("id, name"),
    supabase.from("positions").select("id, name"),
    // The app writes the terminal status as "completed" (not "complete"), and
    // the dashboard only ever surfaces still-open work; restrict to the two
    // live statuses so the query is bounded instead of scanning every task
    // (audit: the old `.neq("status","complete")` never matched, so this
    // fetched the entire tasks table every load).
    supabase
      .from("tasks")
      .select("id, title, status, due_at, assigned_user_id, assigned_position_id")
      .in("status", ["pending", "overdue"]),
    // Dashboard only shows open/overdue work orders; drop terminal rows
    // server-side so this fetch is bounded (the completed history the
    // Maintenance report needs is fetched separately and windowed).
    supabase.from("work_orders").select("id, title, status, priority, due_at").not("status", "in", "(complete,cancelled)"),
    supabase.from("equipment").select("id, name, status, area"),
    supabase.from("waste_entries").select("id, item_id, quantity, logged_at"),
    supabase.from("waste_items").select("id, name, unit, unit_cost, category_id"),
    supabase.from("waste_categories").select("id, name"),
  ]);

  return {
    profiles: profiles ?? [],
    positions: positions ?? [],
    tasks: tasks ?? [],
    workOrders: workOrders ?? [],
    equipment: equipment ?? [],
    wasteEntries: wasteEntries ?? [],
    wasteItems: wasteItems ?? [],
    wasteCategories: wasteCategories ?? [],
  };
}

// ---------------------------------------------------------------------
// Waste report data (reports.view -- waste_entries/items/categories have a
// select_authenticated RLS policy, same as the dashboard base reads). Split
// out of fetchBaseReportData so /reports/waste (which only needs the waste
// rollup inputs) doesn't also pull tasks/work orders/equipment it never uses.
// ---------------------------------------------------------------------

export interface WasteReportData {
  wasteEntries: { id: string; item_id: string; quantity: number; logged_at: string }[];
  wasteItems: { id: string; name: string; unit: string; unit_cost: number | null; category_id: string | null }[];
  wasteCategories: { id: string; name: string }[];
}

export async function fetchWasteReportData(supabase: DB): Promise<WasteReportData> {
  const [{ data: wasteEntries }, { data: wasteItems }, { data: wasteCategories }] = await Promise.all([
    supabase.from("waste_entries").select("id, item_id, quantity, logged_at"),
    supabase.from("waste_items").select("id, name, unit, unit_cost, category_id"),
    supabase.from("waste_categories").select("id, name"),
  ]);

  return {
    wasteEntries: wasteEntries ?? [],
    wasteItems: wasteItems ?? [],
    wasteCategories: wasteCategories ?? [],
  };
}

// ---------------------------------------------------------------------
// Checklists (gated on checklists.view_reports)
// ---------------------------------------------------------------------

export interface ChecklistReportData {
  runs: { id: string; template_id: string; status: string }[];
  templates: { id: string; name: string }[];
  answers: { run_id: string; flagged: boolean }[];
  followUps: { id: string; description: string; status: string; due_at: string | null; assigned_to: string | null }[];
}

export async function fetchChecklistReportData(supabase: DB): Promise<ChecklistReportData> {
  const windowStart = reportWindowStart();
  const windowStartDate = windowStart.slice(0, 10); // run_date is a DATE column
  const [{ data: runs }, { data: templates }, { data: answers }, { data: followUps }] = await Promise.all([
    supabase.from("checklist_runs").select("id, template_id, status").gte("run_date", windowStartDate),
    supabase.from("checklist_templates").select("id, name"),
    supabase.from("checklist_answers").select("run_id, flagged").gte("answered_at", windowStart),
    supabase.from("follow_ups").select("id, description, status, due_at, assigned_to"),
  ]);

  return {
    runs: runs ?? [],
    templates: templates ?? [],
    answers: answers ?? [],
    followUps: followUps ?? [],
  };
}

// ---------------------------------------------------------------------
// Accountability (gated on accountability.manage -- the only permission the
// base `infractions` table's RLS grants a SELECT policy to at all).
// ---------------------------------------------------------------------

export interface AccountabilityReportData {
  infractions: { user_id: string; points: number; expires_at: string | null }[];
  disciplinaryTypes: { id: string; name: string; threshold_points: number }[];
}

export async function fetchAccountabilityReportData(supabase: DB): Promise<AccountabilityReportData> {
  const [{ data: infractions }, { data: disciplinaryTypes }] = await Promise.all([
    supabase.from("infractions").select("user_id, points, expires_at"),
    supabase.from("disciplinary_action_types").select("id, name, threshold_points"),
  ]);

  return {
    infractions: infractions ?? [],
    disciplinaryTypes: disciplinaryTypes ?? [],
  };
}

// ---------------------------------------------------------------------
// Tokens (gated on tokens.manage -- token_transactions RLS only lets a
// non-owner see rows with that permission).
// ---------------------------------------------------------------------

export interface TokenReportData {
  transactions: { id: string; user_id: string; delta: number; kind: string; created_at: string }[];
}

export async function fetchTokenReportData(supabase: DB): Promise<TokenReportData> {
  const { data: transactions } = await supabase
    .from("token_transactions")
    .select("id, user_id, delta, kind, created_at")
    .gte("created_at", reportWindowStart());

  return { transactions: transactions ?? [] };
}

// ---------------------------------------------------------------------
// Reward claims (gated on rewards.fulfill/rewards.manage -- same RLS shape
// as token_transactions).
// ---------------------------------------------------------------------

export interface RewardReportData {
  claims: { id: string; user_id: string; reward_id: string; cost: number; status: string; claimed_at: string }[];
  rewards: { id: string; name: string }[];
}

export async function fetchRewardReportData(supabase: DB): Promise<RewardReportData> {
  const [{ data: claims }, { data: rewards }] = await Promise.all([
    supabase.from("reward_claims").select("id, user_id, reward_id, cost, status, claimed_at"),
    supabase.from("rewards").select("id, name"),
  ]);

  return {
    claims: claims ?? [],
    rewards: rewards ?? [],
  };
}

// ---------------------------------------------------------------------
// Catering (gated on catering.view/catering.manage)
// ---------------------------------------------------------------------

export interface CateringReportData {
  followUps: { id: string; order_id: string; due_on: string | null; done_at: string | null }[];
  orders: { id: string; guest_name: string }[];
}

export async function fetchCateringReportData(supabase: DB): Promise<CateringReportData> {
  const [{ data: followUps }, { data: orders }] = await Promise.all([
    supabase.from("catering_followups").select("id, order_id, due_on, done_at"),
    // event_date was fetched but never used; the dashboard tile keys the
    // follow-up to its order by guest name only.
    supabase.from("catering_orders").select("id, guest_name"),
  ]);

  return {
    followUps: followUps ?? [],
    orders: orders ?? [],
  };
}

// ---------------------------------------------------------------------
// Training (base permission -- every seeded role has training.view)
// ---------------------------------------------------------------------

export interface TrainingReportData {
  passportEnrollments: { id: string; passport_id: string; stamped_at: string | null }[];
  passports: { id: string; name: string }[];
  traineeEnrollments: { id: string; roadmap_id: string; status: string }[];
  roadmaps: { id: string; name: string }[];
}

export async function fetchTrainingReportData(supabase: DB): Promise<TrainingReportData> {
  const [{ data: passportEnrollments }, { data: passports }, { data: traineeEnrollments }, { data: roadmaps }] =
    await Promise.all([
      supabase.from("passport_enrollments").select("id, passport_id, stamped_at"),
      supabase.from("passports").select("id, name"),
      supabase.from("trainee_enrollments").select("id, roadmap_id, status"),
      supabase.from("onboarding_roadmaps").select("id, name"),
    ]);

  return {
    passportEnrollments: passportEnrollments ?? [],
    passports: passports ?? [],
    traineeEnrollments: traineeEnrollments ?? [],
    roadmaps: roadmaps ?? [],
  };
}

// ---------------------------------------------------------------------
// Maintenance reports (reports.view -- work_orders/equipment have a
// select_authenticated RLS policy, same as the dashboard base reads).
// Windowed to REPORT_WINDOW_DAYS by created_at; the three aggregations
// (time-to-resolution, spend, repeat failures) all read completed/costed
// history, which the bounded dashboard work_orders fetch deliberately omits.
// ---------------------------------------------------------------------

export interface MaintenanceReportData {
  workOrders: {
    id: string;
    title: string;
    status: string;
    equipment_id: string | null;
    created_at: string;
    completed_at: string | null;
    cost: number | null;
  }[];
  equipment: { id: string; name: string }[];
}

export async function fetchMaintenanceReportData(supabase: DB): Promise<MaintenanceReportData> {
  const [{ data: workOrders }, { data: equipment }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, title, status, equipment_id, created_at, completed_at, cost")
      .gte("created_at", reportWindowStart()),
    supabase.from("equipment").select("id, name"),
  ]);

  return {
    workOrders: workOrders ?? [],
    equipment: equipment ?? [],
  };
}
