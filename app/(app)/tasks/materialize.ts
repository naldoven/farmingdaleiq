import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

/**
 * Recurring task materialization (PLAN.md S2 "Nightly run materialization as
 * a Supabase scheduled function"; Done: "recurring template materializes").
 *
 * Split into a pure function (`templatesDueOn` / `buildTaskInsert`, unit
 * tested in materialize.test.ts with no DB) and a thin DB-facing wrapper
 * (`materializeTasksForDate`) called from app/api/tasks/sync/route.ts. The
 * route is what an external scheduler (Vercel Cron or similar — see that
 * file's header comment) hits; this module has no knowledge of "when".
 *
 * Convention: `days_of_week` uses JS `Date.getDay()` numbering (0 = Sunday
 * ... 6 = Saturday), matching the `int[]` column with no DB-side check
 * constraint (supabase/migrations/20260707000800_tasks.sql).
 */

export type TaskTemplateRow = Database["public"]["Tables"]["task_templates"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

function dayOfWeek(dateStr: string): number {
  // dateStr is "YYYY-MM-DD"; parse as UTC-midnight to avoid local-timezone
  // drift shifting the weekday.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Which active templates should materialize a task for `dateStr`. */
export function templatesDueOn(
  templates: TaskTemplateRow[],
  dateStr: string,
): TaskTemplateRow[] {
  const dow = dayOfWeek(dateStr);
  return templates.filter((t) => {
    if (!t.active) return false;
    if (t.frequency === "weekly") {
      return Boolean(t.days_of_week && t.days_of_week.includes(dow));
    }
    // "daily" (or unset/legacy) frequency: materializes every day.
    return true;
  });
}

/** Builds the `tasks` insert row for one template on one date. */
export function buildTaskInsert(template: TaskTemplateRow, dateStr: string): TaskInsert {
  const dueAt = template.due_time ? `${dateStr}T${template.due_time}` : null;

  return {
    template_id: template.id,
    kind: "recurring",
    title: template.title,
    description: template.description,
    date: dateStr,
    day_part_id: template.day_part_id,
    start_time: template.start_time,
    due_at: dueAt,
    assigned_user_id: template.assign_user_id,
    assigned_position_id: template.assign_position_id,
    status: "pending",
    token_value: template.token_value,
  };
}

/**
 * Materializes today's (or any target date's) recurring tasks. Idempotent:
 * skips any template that already has a task row for that date, so running
 * this more than once for the same day (retry, more-frequent-than-nightly
 * schedule) never double-creates tasks.
 *
 * Uses whatever client the caller passes — the sync route uses the
 * service-role client since this runs outside any user's session.
 */
export async function materializeTasksForDate(
  supabase: SupabaseClient<Database>,
  dateStr: string,
): Promise<{ created: number; skipped: number }> {
  const { data: templates, error: templatesError } = await supabase
    .from("task_templates")
    .select("*")
    .eq("active", true);

  if (templatesError) {
    throw new Error(`materializeTasksForDate: could not load templates: ${templatesError.message}`);
  }

  const due = templatesDueOn(templates ?? [], dateStr);
  if (due.length === 0) {
    return { created: 0, skipped: 0 };
  }

  const { data: existing, error: existingError } = await supabase
    .from("tasks")
    .select("template_id")
    .eq("date", dateStr)
    .in(
      "template_id",
      due.map((t) => t.id),
    );

  if (existingError) {
    throw new Error(`materializeTasksForDate: could not check existing tasks: ${existingError.message}`);
  }

  const alreadyMaterialized = new Set((existing ?? []).map((r) => r.template_id));
  const toInsert = due
    .filter((t) => !alreadyMaterialized.has(t.id))
    .map((t) => buildTaskInsert(t, dateStr));

  if (toInsert.length === 0) {
    return { created: 0, skipped: due.length };
  }

  // FIQ-14: upsert on (template_id, date) so a concurrent setup-post fan-out
  // materializing the same recurring task can't create a duplicate (which
  // would double-emit task_complete). ignoreDuplicates drops the loser
  // silently instead of raising 23505.
  const { error: insertError } = await supabase
    .from("tasks")
    .upsert(toInsert, { onConflict: "template_id,date", ignoreDuplicates: true });
  if (insertError) {
    throw new Error(`materializeTasksForDate: insert failed: ${insertError.message}`);
  }

  return { created: toInsert.length, skipped: due.length - toInsert.length };
}
