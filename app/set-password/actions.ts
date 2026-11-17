"use server";

import { z } from "zod";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// 8 matches the old client-side check; 72 is the longest password Supabase
// (bcrypt) accepts.
const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.");

export type SetPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Saves the signed-in person's new password, then clears the temporary-
 * password flag (docs/STAFF-SIGN-IN-PLAN.md, Step 5). Both happen in this one
 * server action on purpose: the flag clears only after a password change that
 * actually succeeded, so nobody can skip the forced change by clearing the
 * flag on its own. Supabase refuses a new password equal to the current one,
 * which also stops someone "changing" a temporary password to itself.
 *
 * The flag lives in app_metadata, which only the service role can write. The
 * service-role call targets the caller's own id from getUser(), never an id
 * from the client.
 */
export async function setNewPassword(password: string): Promise<SetPasswordResult> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the password." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Your link has run out. Ask your manager for a new setup link, or use Forgot password.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    return { ok: false, error: error.message };
  }

  if (user.app_metadata?.must_change_password === true) {
    const admin = createServiceRoleClient();
    const clear = () =>
      admin.auth.admin.updateUserById(user.id, { app_metadata: { must_change_password: false } });
    let { error: flagError } = await clear();
    if (flagError) ({ error: flagError } = await clear());
    if (flagError) {
      // Signing in again would not help: the flag is still set, and the same
      // password would now be refused as unchanged.
      return {
        ok: false,
        error: "Your new password is saved, but the app could not finish. Enter a different new password and try again.",
      };
    }
  }

  return { ok: true };
}
