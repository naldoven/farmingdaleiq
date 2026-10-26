"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { loadStoreClock, requireCleaningPlanner } from "@/app/(app)/cleaning/queries";
import { rejectCleanSchema } from "@/app/(app)/cleaning/validation";
import { currentHalf, redoSlot } from "@/app/(app)/cleaning/week-logic";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";

/**
 * Today screen actions for planners. Completing a clean is not here: it
 * carries a photo, so it goes through app/api/cleaning/complete.
 */

/**
 * A planner sends a finished clean back with a note (plan "Checking"). The
 * original stays done but stamped rejected, so it never counts as on time,
 * and a redo opens on the next shift's list: the PM list if it is still
 * morning, tomorrow's AM list otherwise. The slot is picked from the store
 * clock here; the database function walks forward if the item already holds
 * it, and does both steps in one transaction.
 *
 * Safe to tap twice: the second call finds the clean already rejected
 * ('already_rejected'), creates no second redo, and reports success, so a
 * retry after a lost response does not show an error for work that landed. requireCleaningPlanner is the
 * guard, and the function re-checks can_plan_cleaning() itself.
 */
export async function rejectClean(input: { id: string; note: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id, note } = rejectCleanSchema.parse(input);
    const { today, timeOfDay } = await loadStoreClock(supabase);
    const slot = redoSlot(today, currentHalf(timeOfDay));

    const { data, error } = await supabase.rpc("reject_cleaning_assignment", {
      p_assignment_id: id,
      p_note: note,
      p_redo_date: slot.date,
      p_redo_half: slot.half,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, error: "You don't have permission to do this." };
      if (error.code === "22023") return { ok: false, error: "Say what needs redoing." };
      return { ok: false, error: "Could not reject this clean. Try again." };
    }
    if (data === "not_open") {
      return { ok: false, error: "This clean can't be rejected because it is not finished." };
    }
    if (data !== "rejected" && data !== "already_rejected") return { ok: false, error: "Could not reject this clean. Try again." };

    revalidatePath("/cleaning");
    revalidatePath("/cleaning/week");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
