"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(app)/guest-recovery/action-types";
import { menuItemInputSchema } from "@/app/(app)/guest-recovery/validation";
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";

/**
 * Recovery menu manager actions (ARCHITECTURE.md "Guest Recovery"). Items are
 * never deleted, only hidden: logged recoveries keep their own name snapshot,
 * and hiding just removes the item from the picker on /guest-recovery/new.
 * RLS (guest_recovery.manage) re-checks every write.
 */

const setActiveSchema = z.object({
  id: z.uuid("That item is not valid"),
  active: z.boolean(),
});

function revalidateMenu() {
  revalidatePath("/guest-recovery/menu");
  revalidatePath("/guest-recovery/new");
}

export async function addMenuItem(input: {
  name: string;
  family: string;
  category: string;
}): Promise<ActionResult> {
  try {
    await requirePermission("guest_recovery.manage");
    const parsed = menuItemInputSchema.parse(input);
    const supabase = await createClient();

    // New items go to the end of the list. Two leaders adding at the same
    // moment can share a sort value; that only affects order, never data.
    const { data: last, error: sortError } = await supabase
      .from("recovery_menu_items")
      .select("sort")
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sortError) return { ok: false, error: sortError.message };

    const { error } = await supabase
      .from("recovery_menu_items")
      .insert({ ...parsed, sort: (last?.sort ?? 0) + 1 });

    if (error) {
      if (error.code !== "23505") return { ok: false, error: error.message };
      // The name is unique. Tell the leader whether the twin is hidden.
      const { data: existing } = await supabase
        .from("recovery_menu_items")
        .select("active")
        .eq("name", parsed.name)
        .maybeSingle();
      return {
        ok: false,
        error:
          existing && !existing.active
            ? "That item is hidden. Turn it back on below."
            : "That item is already on the menu",
      };
    }

    revalidateMenu();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Setting the state it is already in is a success, so a double tap is harmless. */
export async function setMenuItemActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  try {
    await requirePermission("guest_recovery.manage");
    const { id, active } = setActiveSchema.parse(input);
    const supabase = await createClient();

    // select() so an id that matches nothing is an error, not a silent save.
    const { data, error } = await supabase
      .from("recovery_menu_items")
      .update({ active })
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: "That item was not found." };

    revalidateMenu();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
