"use server";

/**
 * ============================================================================
 * SERVER ACTION PERMISSION-GUARD PATTERN — read this before writing any other
 * stream's server actions. This file is the reference implementation
 * (PLAN.md "Ground rules": "Every server action validates permissions
 * server-side. UI hiding is not security; RLS and permission checks are.").
 *
 * 1. Every action starts with `await requirePermission(<key>)` (or, when an
 *    action is legitimately self-service, a narrower check first — see none
 *    here; People edits are admin-only end to end). requirePermission()
 *    (lib/auth/permissions.ts) throws PermissionError before any DB call if
 *    the signed-in user's role lacks the key.
 * 2. After the guard, mutations go through the per-request Supabase client
 *    (lib/supabase/server.ts createClient()) — the one carrying the caller's
 *    auth cookies — NOT the service-role client. That means Postgres RLS
 *    (supabase/migrations/20260707001850_people_teams_rls.sql) independently
 *    re-checks has_permission(key) for the same write. requirePermission() is
 *    the fast, friendly failure (nice error message, no round trip to
 *    Postgres); RLS is the real backstop if a caller ever skips step 1 (bug,
 *    direct API call, a future action that forgets the guard).
 * 3. The ONE exception: creating an auth user has no RLS equivalent (it isn't
 *    a table write), so createServiceRoleClient() is used for that single
 *    call in `inviteUser`, and only ever after requirePermission() already
 *    passed. Every other read/write in this file uses the normal
 *    per-request client.
 * 4. Actions return a discriminated `ActionResult` instead of throwing, so
 *    forms can render an inline error. PermissionError is caught and mapped
 *    to a generic message — never leak which permission key was missing.
 * 5. Every mutation calls `revalidatePath()` for the routes that read the
 *    changed data, so the UI reflects the write without a full reload.
 * ============================================================================
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/people/action-types";
import {
  assignRoleSchema,
  inviteUserSchema,
  updateProfileSchema,
  type AssignRoleInput,
  type InviteUserInput,
  type UpdateProfileInput,
} from "@/app/(app)/people/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

/**
 * Edits a profile's contact fields, birthdate, hired_on, discord_user_id, and
 * active status. Admin-only (people.manage) for every field — there is no
 * self-service edit path in this module (ARCHITECTURE.md "Identity, roles &
 * permissions"; PLAN.md P0 #6 "profile page (contact, role, birthdate,
 * hired_on, discord_user_id field)").
 */
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<ActionResult> {
  try {
    await requirePermission("people.manage");

    const parsed = updateProfileSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("profiles")
      .update({
        name: parsed.name,
        phone: parsed.phone ? parsed.phone : null,
        discord_user_id: parsed.discordUserId ? parsed.discordUserId : null,
        birthdate: parsed.birthdate ? parsed.birthdate : null,
        hired_on: parsed.hiredOn ? parsed.hiredOn : null,
        active: parsed.active,
      })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/people");
    revalidatePath(`/people/${parsed.id}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Changes which role a profile is assigned to. Same permission key as
 * updateProfile (people.manage) — matches profiles_update_manager in
 * supabase/migrations/20260707001850_people_teams_rls.sql, which is the RLS
 * policy actually enforcing this at the database layer. `roles.manage` is a
 * distinct, broader permission that governs editing role definitions and
 * role_permissions (out of scope for this module: see PLAN.md P0 #6, which
 * asks for role *assignment*, not a role/permission editor).
 */
export async function assignRole(
  input: AssignRoleInput,
): Promise<ActionResult> {
  try {
    await requirePermission("people.manage");

    const parsed = assignRoleSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("profiles")
      .update({ role_id: parsed.roleId })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/people");
    revalidatePath(`/people/${parsed.id}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Creates a new employee: an auth user (via the Supabase Auth admin API,
 * service-role only) plus their profile row. `supabase/migrations/
 * 20260707000200_core.sql` already creates a bare profile row via the
 * `handle_new_auth_user` trigger the moment the auth user exists (store
 * default + lowest-rank role); this action then fills in the real name,
 * chosen role, and phone through the normal permission-guarded update path.
 *
 * SUPABASE_SERVICE_ROLE_KEY is read only inside createServiceRoleClient()
 * (lib/supabase/server.ts), server-side, and only for the one admin-API call
 * below — never returned to the caller, never used for the profile update.
 */
export async function inviteUser(
  input: InviteUserInput,
): Promise<ActionResult<{ userId: string }>> {
  try {
    await requirePermission("people.manage");

    const parsed = inviteUserSchema.parse(input);
    const admin = createServiceRoleClient();

    // Point the invite link at our auth callback so the invited user lands on
    // /set-password (via /auth/callback, which exchanges the code for a
    // session). Without a redirectTo the invite defaults to the Supabase Site
    // URL (the app root), where there is no code handler and the invite breaks.
    const hdrs = await headers();
    const forwardedProto = hdrs.get("x-forwarded-proto");
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
    const origin =
      hdrs.get("origin") ??
      (host ? `${forwardedProto ?? "https"}://${host}` : "");
    const redirectTo = origin
      ? `${origin}/auth/callback?next=${encodeURIComponent("/set-password")}`
      : undefined;

    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      parsed.email,
      { data: { name: parsed.name }, redirectTo },
    );

    if (error || !data.user) {
      return {
        ok: false,
        error: error?.message ?? "Could not create the account.",
      };
    }

    const userId = data.user.id;

    // The trigger has already inserted a bare profiles row for userId at
    // this point (handle_new_auth_user fires synchronously on auth.users
    // insert). Fill in the real name/role/phone through the normal
    // per-request client so RLS's people.manage check applies here too.
    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        name: parsed.name,
        role_id: parsed.roleId,
        phone: parsed.phone ? parsed.phone : null,
      })
      .eq("id", userId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    revalidatePath("/people");
    return { ok: true, data: { userId } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
