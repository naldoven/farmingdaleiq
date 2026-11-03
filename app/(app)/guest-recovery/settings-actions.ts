"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(app)/guest-recovery/action-types";
import { settingsSchema } from "@/app/(app)/guest-recovery/validation";
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";

/**
 * Recovery settings actions (ARCHITECTURE.md "Guest Recovery"). The settings
 * row has no direct write path: both actions go through security-definer
 * functions that re-check the caller and the people picked.
 */

const overseerOffSchema = z.object({ off: z.boolean() });

export async function saveRecoverySettings(input: {
  expiryDays: number;
  overseerId: string | null;
  backupId: string | null;
  storePhone?: string;
}): Promise<ActionResult> {
  try {
    await requirePermission("guest_recovery.manage");
    const parsed = settingsSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("save_guest_recovery_settings", {
      p_expiry_days: parsed.expiryDays,
      p_overseer: parsed.overseerId,
      p_backup: parsed.backupId,
      p_store_phone: parsed.storePhone,
    });
    if (error) return { ok: false, error: error.message };
    if (data === "bad_person") {
      return { ok: false, error: "Pick people who can work Guest Recovery (Team Leader and up)." };
    }
    if (data !== "saved") return { ok: false, error: "Could not save the settings." };

    revalidatePath("/guest-recovery/menu/settings");
    revalidatePath("/guest-recovery");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Setting the state it is already in is a success, so a double tap is harmless. */
export async function setOverseerOff(input: { off: boolean }): Promise<ActionResult> {
  try {
    await requirePermission("guest_recovery.log");
    const { off } = overseerOffSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("set_guest_recovery_overseer_off", { p_off: off });
    if (error) return { ok: false, error: error.message };
    if (data === "not_allowed") {
      return { ok: false, error: "Only the overseer or a manager can change this." };
    }
    if (data !== "saved") return { ok: false, error: "Could not change this." };

    revalidatePath("/guest-recovery");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
