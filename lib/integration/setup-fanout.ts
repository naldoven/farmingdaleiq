/**
 * P2 wiring (PLAN.md "Phase 2: integration" item 1, docs/agent-map.md
 * "Wiring" row): when a setup is POSTED, materialize the checklist_runs and
 * tasks linked to each assigned position, attached to the person now working
 * that position, for that date + day-part.
 *
 * This is the S3 -> S1/S2 seam. It is deliberately a thin cross-module
 * integration layer that only:
 *   - reads S3's setups/setup_assignments (which positions have who today),
 *   - reads S1's checklist_schedules/templates and S2's task_templates
 *     (which recurring work is position-linked),
 *   - writes S1's checklist_runs and S2's tasks (the materialized instances).
 * It never rewrites any module's internal logic. The "is this schedule/
 * template due today?" decision is reused verbatim from the owning modules'
 * pure helpers (isScheduleDueOn from checklists/logic, templatesDueOn +
 * buildTaskInsert from tasks/materialize), so this file cannot drift from how
 * the nightly crons decide the same thing.
 *
 * Idempotency (PLAN.md ground rule "re-posting must not duplicate"):
 *   - checklist_runs are keyed by (schedule_id, run_date) — the exact same
 *     key app/api/cron/checklists uses — so this and the nightly cron
 *     converge on one run per schedule per day no matter which fires first.
 *   - tasks are keyed by (template_id, date) — the same key
 *     app/(app)/tasks/materialize uses.
 * When a run/task the nightly cron already created exists but has no assignee
 * yet, this backfills the assignee (the cron can't know who is on the setup);
 * re-running makes no further change. When neither exists, this inserts it
 * with the assignee.
 *
 * RLS: checklist_runs has no user-level insert policy (materialization is a
 * service job — see supabase/migrations/20260707010000_checklists_rls.sql),
 * and tasks inserts require tasks.manage, which the shift leader posting a
 * setup does not necessarily hold. So this runs with the service-role client.
 * The auth boundary is postSetup()'s requirePermission("setups.post"); this
 * function is only ever reached after that check passes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";
import { isScheduleDueOn, type ScheduleLike } from "@/app/(app)/checklists/logic";
import {
  buildTaskInsert,
  templatesDueOn,
  type TaskInsert,
  type TaskTemplateRow,
} from "@/app/(app)/tasks/materialize";

type ChecklistRunInsert = Database["public"]["Tables"]["checklist_runs"]["Insert"];

export interface ScheduleRow extends ScheduleLike {
  id: string;
  template_id: string;
  day_part_id: string | null;
  assign_position_id: string | null;
}

export interface ExistingRunRow {
  id: string;
  schedule_id: string | null;
  assigned_user_id: string | null;
}

export interface ExistingTaskRow {
  id: string;
  template_id: string | null;
  assigned_user_id: string | null;
}

export interface Backfill {
  id: string;
  assigned_user_id: string;
}

export interface ChecklistRunPlan {
  inserts: ChecklistRunInsert[];
  backfills: Backfill[];
}

export interface TaskPlan {
  inserts: TaskInsert[];
  backfills: Backfill[];
}

/** Parses a "YYYY-MM-DD" setup date into a local-midnight Date, matching how
 * the checklists/tasks materializers interpret the run date (no timezone
 * drift shifting the weekday). */
export function parseSetupDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function dayPartMatches(scheduleDayPart: string | null, setupDayPart: string | null): boolean {
  // A position-linked schedule/template with no day-part of its own applies
  // to whatever day-part the setup is for. One that names a day-part only
  // applies when it matches the setup's day-part.
  if (!scheduleDayPart) return true;
  if (!setupDayPart) return true;
  return scheduleDayPart === setupDayPart;
}

/**
 * Pure planner: given the position->assignee map and the position-linked
 * checklist schedules, decide which checklist_runs to insert and which
 * existing (cron-created, unassigned) runs to backfill with an assignee.
 */
export function planChecklistRunsForSetup(args: {
  date: string;
  setupDayPartId: string | null;
  positionUser: Map<string, string>;
  schedules: ScheduleRow[];
  activeTemplateIds: Set<string>;
  existingRuns: ExistingRunRow[];
  runDateFor: Date;
}): ChecklistRunPlan {
  const existingBySchedule = new Map<string, ExistingRunRow>();
  for (const run of args.existingRuns) {
    if (run.schedule_id) existingBySchedule.set(run.schedule_id, run);
  }

  const inserts: ChecklistRunInsert[] = [];
  const backfills: Backfill[] = [];

  for (const schedule of args.schedules) {
    if (!schedule.assign_position_id) continue;
    const userId = args.positionUser.get(schedule.assign_position_id);
    if (!userId) continue;
    if (!args.activeTemplateIds.has(schedule.template_id)) continue;
    if (!dayPartMatches(schedule.day_part_id, args.setupDayPartId)) continue;
    if (!isScheduleDueOn(schedule, args.runDateFor)) continue;

    const existing = existingBySchedule.get(schedule.id);
    if (!existing) {
      inserts.push({
        template_id: schedule.template_id,
        schedule_id: schedule.id,
        run_date: args.date,
        day_part_id: schedule.day_part_id ?? args.setupDayPartId,
        assigned_position_id: schedule.assign_position_id,
        assigned_user_id: userId,
        status: "pending",
      });
    } else if (!existing.assigned_user_id) {
      backfills.push({ id: existing.id, assigned_user_id: userId });
    }
  }

  return { inserts, backfills };
}

/**
 * Pure planner for the S2 task seam: which position-linked recurring tasks to
 * insert for this setup, and which existing (cron-created, unassigned) ones to
 * backfill with the assignee + setup link.
 */
export function planTasksForSetup(args: {
  date: string;
  setupId: string;
  setupDayPartId: string | null;
  positionUser: Map<string, string>;
  templates: TaskTemplateRow[];
  existingTasks: ExistingTaskRow[];
}): TaskPlan {
  const existingByTemplate = new Map<string, ExistingTaskRow>();
  for (const task of args.existingTasks) {
    if (task.template_id) existingByTemplate.set(task.template_id, task);
  }

  const due = templatesDueOn(args.templates, args.date).filter(
    (t) =>
      t.assign_position_id &&
      args.positionUser.has(t.assign_position_id) &&
      dayPartMatches(t.day_part_id, args.setupDayPartId),
  );

  const inserts: TaskInsert[] = [];
  const backfills: Backfill[] = [];

  for (const template of due) {
    const userId = args.positionUser.get(template.assign_position_id as string) as string;
    const existing = existingByTemplate.get(template.id);
    if (!existing) {
      inserts.push({
        ...buildTaskInsert(template, args.date),
        assigned_user_id: userId,
        setup_id: args.setupId,
      });
    } else if (!existing.assigned_user_id) {
      backfills.push({ id: existing.id, assigned_user_id: userId });
    }
  }

  return { inserts, backfills };
}

export interface FanoutResult {
  checklistRunsCreated: number;
  checklistRunsBackfilled: number;
  tasksCreated: number;
  tasksBackfilled: number;
}

const ZERO: FanoutResult = {
  checklistRunsCreated: 0,
  checklistRunsBackfilled: 0,
  tasksCreated: 0,
  tasksBackfilled: 0,
};

function firstAssigneePerPosition(
  assignments: { position_id: string | null; user_id: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of assignments) {
    if (a.position_id && a.user_id && !map.has(a.position_id)) {
      map.set(a.position_id, a.user_id);
    }
  }
  return map;
}

/**
 * Materializes the position-linked checklist_runs and tasks for a posted
 * setup. Idempotent and safe to call more than once (see module header).
 * Uses the service-role client by default; a client can be injected for
 * tests.
 */
export async function materializeSetupFanout(
  setupId: string,
  client: SupabaseClient<Database> = createServiceRoleClient(),
): Promise<FanoutResult> {
  const { data: setup } = await client
    .from("setups")
    .select("id, date, day_part_id")
    .eq("id", setupId)
    .maybeSingle();

  if (!setup) return { ...ZERO };

  const { data: assignments } = await client
    .from("setup_assignments")
    .select("position_id, user_id")
    .eq("setup_id", setupId)
    .not("user_id", "is", null);

  const positionUser = firstAssigneePerPosition(assignments ?? []);
  if (positionUser.size === 0) return { ...ZERO };

  const positionIds = [...positionUser.keys()];
  const runDateFor = parseSetupDate(setup.date);
  const result: FanoutResult = { ...ZERO };

  // --- Checklists (S1) ---------------------------------------------------
  const { data: schedules } = await client
    .from("checklist_schedules")
    .select("id, template_id, frequency, days_of_week, day_of_month, day_part_id, assign_position_id")
    .in("assign_position_id", positionIds);

  const scheduleRows = (schedules ?? []) as ScheduleRow[];
  if (scheduleRows.length > 0) {
    const templateIds = [...new Set(scheduleRows.map((s) => s.template_id))];
    const { data: templates } = await client
      .from("checklist_templates")
      .select("id, active")
      .in("id", templateIds);
    const activeTemplateIds = new Set((templates ?? []).filter((t) => t.active).map((t) => t.id));

    const scheduleIds = scheduleRows.map((s) => s.id);
    const { data: existingRuns } = await client
      .from("checklist_runs")
      .select("id, schedule_id, assigned_user_id")
      .eq("run_date", setup.date)
      .in("schedule_id", scheduleIds);

    const plan = planChecklistRunsForSetup({
      date: setup.date,
      setupDayPartId: setup.day_part_id,
      positionUser,
      schedules: scheduleRows,
      activeTemplateIds,
      existingRuns: (existingRuns ?? []) as ExistingRunRow[],
      runDateFor,
    });

    if (plan.inserts.length > 0) {
      // FIQ-09: upsert on (schedule_id, run_date) so this fan-out and the
      // nightly checklists cron converge on one run per schedule per day even
      // when they race; ignoreDuplicates drops the loser silently.
      const { error } = await client
        .from("checklist_runs")
        .upsert(plan.inserts, { onConflict: "schedule_id,run_date", ignoreDuplicates: true });
      if (!error) result.checklistRunsCreated = plan.inserts.length;
    }
    for (const backfill of plan.backfills) {
      const { error } = await client
        .from("checklist_runs")
        .update({ assigned_user_id: backfill.assigned_user_id })
        .eq("id", backfill.id)
        .is("assigned_user_id", null);
      if (!error) result.checklistRunsBackfilled += 1;
    }
  }

  // --- Tasks (S2) --------------------------------------------------------
  const { data: taskTemplates } = await client
    .from("task_templates")
    .select("*")
    .eq("active", true)
    .in("assign_position_id", positionIds);

  const taskTemplateRows = (taskTemplates ?? []) as TaskTemplateRow[];
  if (taskTemplateRows.length > 0) {
    const templateIds = taskTemplateRows.map((t) => t.id);
    const { data: existingTasks } = await client
      .from("tasks")
      .select("id, template_id, assigned_user_id")
      .eq("date", setup.date)
      .in("template_id", templateIds);

    const plan = planTasksForSetup({
      date: setup.date,
      setupId,
      setupDayPartId: setup.day_part_id,
      positionUser,
      templates: taskTemplateRows,
      existingTasks: (existingTasks ?? []) as ExistingTaskRow[],
    });

    if (plan.inserts.length > 0) {
      // FIQ-14: upsert on (template_id, date) so this fan-out and the tasks
      // sync cron can't both materialize the same recurring task (which would
      // double-emit task_complete). ignoreDuplicates drops the loser silently.
      const { error } = await client
        .from("tasks")
        .upsert(plan.inserts, { onConflict: "template_id,date", ignoreDuplicates: true });
      if (!error) result.tasksCreated = plan.inserts.length;
    }
    for (const backfill of plan.backfills) {
      const { error } = await client
        .from("tasks")
        .update({ assigned_user_id: backfill.assigned_user_id })
        .eq("id", backfill.id)
        .is("assigned_user_id", null);
      if (!error) result.tasksBackfilled += 1;
    }
  }

  return result;
}
