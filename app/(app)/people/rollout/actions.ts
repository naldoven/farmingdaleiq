"use server";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/people/action-types";
import { compareEmailList, type EmailComparison } from "@/app/(app)/people/rollout/logic";
import { checkInviteListSchema, type CheckInviteListInput } from "@/app/(app)/people/rollout/validation";

/**
 * Compares a pasted list of emails against existing accounts so a manager can
 * see who still needs an invite without anyone reading addresses aloud.
 *
 * Read-only: nothing is written or stored. Gated by people.manage first. The
 * service-role client is needed because profiles_private is locked from
 * PostgREST (supabase/migrations/20260718020000_profiles_private_pii.sql).
 * Known emails stay on the server; the only addresses returned are ones the
 * manager pasted themselves.
 */
export async function checkInviteList(
  input: CheckInviteListInput,
): Promise<ActionResult<EmailComparison>> {
  try {
    await requirePermission("people.manage");

    const parsed = checkInviteListSchema.parse(input);
    const admin = createServiceRoleClient();
    const { data, error } = await admin.from("profiles_private").select("email");
    if (error) {
      return { ok: false, error: "Could not read existing accounts. Try again." };
    }

    const known = (data ?? []).flatMap((row) => (row.email ? [row.email] : []));
    return { ok: true, data: compareEmailList(parsed.emails, known) };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
