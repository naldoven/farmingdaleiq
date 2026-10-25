"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import { findStoreSetupArea } from "@/lib/store-setup/areas";
import type { ActionResult } from "@/app/(app)/settings/setup/action-types";
import { setupAreaKeySchema, type SetupAreaKeyInput } from "@/app/(app)/settings/setup/validation";

/**
 * Store setup confirmations (docs/STORE-SETUP.md). Both actions follow the
 * reference pattern in app/(app)/people/actions.ts: requirePermission first,
 * zod parse, per-request client so RLS re-checks settings.manage.
 *
 * Idempotent by construction. Confirming twice upserts the same primary key
 * and only moves confirmed_at; marking default twice deletes a row that is
 * already gone. A double tap on a phone is harmless either way.
 */

function revalidateArea(areaKey: SetupAreaKeyInput["areaKey"]): void {
  revalidatePath("/settings");
  revalidatePath("/settings/setup");
  const { href } = findStoreSetupArea(areaKey);
  // The editor shows a "Default, not confirmed" tag off the same table, so it
  // has to re-render too. Strip the query string: revalidatePath takes routes.
  if (href) revalidatePath(href.split("?")[0]);
}

export async function markAreaConfirmed(input: SetupAreaKeyInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = setupAreaKeySchema.parse(input);
    const supabase = await createClient();

    // confirmed_by always comes from the session, never from input. The RLS
    // policy checks confirmed_by = auth.uid() as well, so a row can never name
    // someone else as the confirmer.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "You need to be signed in." };

    const { error } = await supabase.from("store_setup_areas").upsert({
      area_key: parsed.areaKey,
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
    });

    if (error) return { ok: false, error: error.message };

    revalidateArea(parsed.areaKey);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function markAreaDefault(input: SetupAreaKeyInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = setupAreaKeySchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("store_setup_areas").delete().eq("area_key", parsed.areaKey);

    if (error) return { ok: false, error: error.message };

    revalidateArea(parsed.areaKey);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
