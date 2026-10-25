"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { loadStoreClock, requireCleaningPlanner } from "@/app/(app)/cleaning/queries";
import { weekStartSchema } from "@/app/(app)/cleaning/validation";
import { buildCleaningWeek, type BuildResult } from "@/app/(app)/cleaning/week-build";
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
