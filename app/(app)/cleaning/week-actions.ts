"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { isUniqueViolation } from "@/app/(app)/cleaning/logic";
import { loadStoreClock, requireCleaningPlanner } from "@/app/(app)/cleaning/queries";
import {
  addCleanSchema,
  itemIdSchema,
  moveCleanSchema,
  skipCleanSchema,
  weekStartSchema,
} from "@/app/(app)/cleaning/validation";
import { buildCleaningWeek, type BuildResult } from "@/app/(app)/cleaning/week-build";
import { addDays, boardWeekStart, type SlotHalf } from "@/app/(app)/cleaning/week-logic";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";

/**
 * Weekly board actions for planners (docs/CLEANING-PLAN.md "How a week
 * runs"). Every one runs requireCleaningPlanner first; RLS on
 * cleaning_assignments re-checks the same can_plan_cleaning() helper.
 */

function revalidateBoard() {
  revalidatePath("/cleaning");
  revalidatePath("/cleaning/week");
}

/**
 * "Build now": the same build the hourly job runs Thursday night, for a
 * planner who wants the week before then (or the very first week). Safe to
 * tap twice; the second tap reports the week already built.
 */
export async function buildWeekNow(input: { weekStart: string }): Promise<ActionResult<BuildResult>> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { weekStart } = weekStartSchema.parse(input);
    const { today, timeZone } = await loadStoreClock(supabase);

    const result = await buildCleaningWeek(supabase, { weekStart, today, timeZone });
    revalidateBoard();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

const ALREADY_THERE = "That item is already in that slot.";
const GONE = "That clean is no longer on the board. Refresh and try again.";
const CHANGED = "That clean changed while you were looking. Refresh and try again.";
const PAST_DAY = "That day has already passed.";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Why an update or delete touched no rows: the row's state right now. */
async function currentState(supabase: Client, id: string): Promise<{ status: string; origin: string } | null> {
  const { data } = await supabase.from("cleaning_assignments").select("status, origin").eq("id", id).maybeSingle();
  return data;
}

/**
 * Moves one planned clean to another day or half of its own week. Past days
 * are refused: a planned clean left on a day that has ended is closed out as
 * a miss against that day's leader (close_cleaning_days), so moving one there
 * would be a planner creating a miss by hand. Landing past the slot's cap is
 * allowed on purpose, it is the planner's call.
 */
export async function moveClean(input: { id: string; date: string; half: SlotHalf }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id, date, half } = moveCleanSchema.parse(input);

    const { data: row, error: loadError } = await supabase
      .from("cleaning_assignments")
      .select("week_start, status")
      .eq("id", id)
      .maybeSingle();
    if (loadError) return { ok: false, error: loadError.message };
    if (!row) return { ok: false, error: GONE };
    if (row.status !== "planned") return { ok: false, error: "Only a planned clean can be moved." };
    if (date < row.week_start || date > addDays(row.week_start, 5)) {
      return { ok: false, error: "Pick a day in the same week." };
    }
    const { today } = await loadStoreClock(supabase);
    if (date < today) return { ok: false, error: PAST_DAY };

    // The status filter makes a clean that was just done or skipped on
    // another phone fail here instead of being dragged along.
    const { data: moved, error } = await supabase
      .from("cleaning_assignments")
      .update({ date, half })
      .eq("id", id)
      .eq("status", "planned")
      .select("id");
    if (error) return { ok: false, error: isUniqueViolation(error) ? ALREADY_THERE : error.message };
    if (!moved || moved.length === 0) return { ok: false, error: CHANGED };

    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Defers a planned clean with a reason. A skip is not a miss and changes
 * nothing else: next due is worked out from completions, so the item stays
 * overdue and the next build places it first. Only today or later, otherwise
 * a planner could skip yesterday's clean and hide the miss.
 */
export async function skipClean(input: { id: string; reason: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id, reason } = skipCleanSchema.parse(input);
    const { today } = await loadStoreClock(supabase);

    const { data: skipped, error } = await supabase
      .from("cleaning_assignments")
      .update({ status: "skipped", skip_reason: reason })
      .eq("id", id)
      .eq("status", "planned")
      .gte("date", today)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!skipped || skipped.length === 0) {
      const state = await currentState(supabase, id);
      // A double tap finds it already skipped: same end state, so it is a success.
      if (state?.status === "skipped") return { ok: true, data: undefined };
      if (!state) return { ok: false, error: GONE };
      if (state.status !== "planned") return { ok: false, error: "Only a planned clean can be skipped." };
      return { ok: false, error: "That day has already passed, so it can't be skipped." };
    }

    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Undoes a mistaken skip. */
export async function unskipClean(input: { id: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id } = itemIdSchema.parse(input);
    const { today } = await loadStoreClock(supabase);

    const { data: restored, error } = await supabase
      .from("cleaning_assignments")
      .update({ status: "planned", skip_reason: null })
      .eq("id", id)
      .eq("status", "skipped")
      .gte("date", today)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!restored || restored.length === 0) {
      const state = await currentState(supabase, id);
      if (state?.status === "planned") return { ok: true, data: undefined };
      if (!state) return { ok: false, error: GONE };
      if (state.status === "skipped") return { ok: false, error: PAST_DAY };
      return { ok: false, error: "Only a skipped clean can be put back." };
    }

    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Takes a pulled-in extra (or a carry-over or redo) off the board. A
 * constant is never removed, it is skipped; a clean that is already done,
 * missed or skipped keeps its record.
 */
export async function removeClean(input: { id: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id } = itemIdSchema.parse(input);

    const { data: removed, error } = await supabase
      .from("cleaning_assignments")
      .delete()
      .eq("id", id)
      .eq("status", "planned")
      .neq("origin", "constant")
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!removed || removed.length === 0) {
      const state = await currentState(supabase, id);
      // Already gone is what a double tap wants.
      if (!state) return { ok: true, data: undefined };
      if (state.origin === "constant") return { ok: false, error: "A constant can't be removed. Skip it instead." };
      return { ok: false, error: "Only a planned clean can be removed." };
    }

    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Pulls one item onto a day early ("pull from master list", or the tray's
 * Add buttons). Active items in active zones only, the same set the build
 * draws from, so a hidden FOH zone stays out of a BOH week. The week row is
 * created on demand, so a planner can add to next week before the Thursday
 * build; the build then leaves this clean alone (it skips anything already on
 * the board).
 */
export async function addClean(input: { itemId: string; date: string; half: SlotHalf }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { itemId, date, half } = addCleanSchema.parse(input);
    const { today } = await loadStoreClock(supabase);
    if (date < today) return { ok: false, error: PAST_DAY };

    const { data: item, error: itemError } = await supabase
      .from("cleaning_items")
      .select("id, status, zone:cleaning_zones(active)")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError) return { ok: false, error: itemError.message };
    if (!item || item.status !== "active" || !item.zone?.active) {
      return { ok: false, error: "That item isn't on the active list." };
    }

    const weekStart = boardWeekStart(date);
    const { error: weekError } = await supabase
      .from("cleaning_weeks")
      .upsert({ week_start: weekStart }, { onConflict: "week_start", ignoreDuplicates: true });
    if (weekError) return { ok: false, error: weekError.message };

    const { error } = await supabase
      .from("cleaning_assignments")
      .insert({ week_start: weekStart, item_id: itemId, date, half, origin: "manual" });
    if (error) return { ok: false, error: isUniqueViolation(error) ? ALREADY_THERE : error.message };

    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
