"use server";

/**
 * ============================================================================
 * SERVER ACTION PERMISSION-GUARD PATTERN — read this before writing any other
 * stream's server actions. This file is the reference implementation
 * (PLAN.md "Ground rules": "Every server action validates permissions
 * server-side. UI hiding is not security; RLS and permission checks are.").
 *
 * 1. Every action starts with `await requirePermission(<key>)` (or, when an
 *    action is legitimately self-service, a narrower check first — see
 *    `updateOwnProfile` below, which skips requirePermission entirely and
 *    relies on `profiles_update_self` RLS plus the privilege-guard trigger
 *    instead, because it only ever writes the caller's own row and only the
 *    columns that guard leaves genuinely self-editable). requirePermission()
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
  selfUpdateProfileSchema,
  updateProfileSchema,
  type AssignRoleInput,
  type InviteUserInput,
  type SelfUpdateProfileInput,
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
        avatar_url: parsed.avatarUrl ? parsed.avatarUrl : null,
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
 * Self-service edit of the caller's own contact fields
 * (KITCHENIQ-PARITY-AUDIT.md "People & Teams" [MED]: "No self-service edit
 * path despite the DB layer allowing one"). Intentionally has no
 * requirePermission() call — see the pattern comment at the top of this
 * file — and only ever targets `.eq("id", user.id)`, so it cannot be used
 * to edit anyone else regardless of the caller's role. Only phone,
 * birthdate, and avatar_url are accepted; role_id/active/store_id/
 * discord_user_id/name/email require updateProfile (people.manage) and
 * would be rejected by `profile_privilege_guard` even if someone tried to
 * smuggle them in here.
 */
export async function updateOwnProfile(
  input: SelfUpdateProfileInput,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const parsed = selfUpdateProfileSchema.parse(input);

    const { error } = await supabase
      .from("profiles")
      .update({
        phone: parsed.phone ? parsed.phone : null,
        birthdate: parsed.birthdate ? parsed.birthdate : null,
        avatar_url: parsed.avatarUrl ? parsed.avatarUrl : null,
      })
      .eq("id", user.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/people");
    revalidatePath(`/people/${user.id}`);
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

/**
 * Read-only bootstrap-eligibility check (KITCHENIQ-PARITY-AUDIT.md
 * "People & Teams" [HIGH]: "No bootstrap path for the first admin; live DB
 * has zero users — new signups always get the lowest role, and inviteUser
 * requires people.manage that nobody holds yet"). Deliberately callable by
 * anyone signed in (no requirePermission): its only job is to tell the
 * /people/bootstrap page whether the "claim admin access" button should show,
 * and it leaks nothing more sensitive than "an admin exists or not".
 *
 * Runs on the service-role client because the honest answer ("is anyone an
 * admin yet") must see past `profiles_select_store_member` RLS, which would
 * otherwise silently return 0 rows for a brand-new user with no role at all.
 */
export async function getBootstrapEligibility(): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  try {
    const admin = createServiceRoleClient();

    const { data: adminRoles, error: adminRolesError } = await admin
      .from("role_permissions")
      .select("role_id")
      .eq("permission_key", "people.manage");

    if (adminRolesError) {
      return { eligible: false, reason: adminRolesError.message };
    }

    const adminRoleIds = (adminRoles ?? []).map((r) => r.role_id);
    if (adminRoleIds.length === 0) {
      return {
        eligible: false,
        reason: "No role is configured with people.manage yet.",
      };
    }

    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role_id", adminRoleIds);

    if (countError) {
      return { eligible: false, reason: countError.message };
    }

    if ((count ?? 0) > 0) {
      return {
        eligible: false,
        reason: "An admin already exists for this store. Ask them to invite you.",
      };
    }

    return { eligible: true };
  } catch {
    return { eligible: false };
  }
}

/**
 * One-time first-admin bootstrap. Deliberately skips requirePermission():
 * by definition nobody holds people.manage yet, so no permission check could
 * ever pass. Safety comes from the bootstrap condition itself instead — see
 * `getBootstrapEligibility()` above, re-checked here immediately before the
 * write so a race between two simultaneous callers can promote at most one
 * of them (the second call's own re-check sees the first call's write... in
 * the rare case both reads land before either write, this is a known,
 * accepted narrow race for a one-time, pre-launch bootstrap action, not a
 * standing privilege hole: the instant one admin exists this action is
 * permanently inert for everyone, including the two racers).
 *
 * The write runs on the service-role client because
 * `profile_privilege_guard` (supabase/migrations/20260707002000_
 * profile_privilege_guard.sql) only allows a role_id change when the actor
 * already holds people.manage or is the service-role client — exactly the
 * same escape hatch `inviteUser` above already relies on.
 */
export async function bootstrapFirstAdmin(): Promise<
  ActionResult<{ roleId: string; roleName: string }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const eligibility = await getBootstrapEligibility();
    if (!eligibility.eligible) {
      return {
        ok: false,
        error: eligibility.reason ?? "Bootstrap is no longer available.",
      };
    }

    const admin = createServiceRoleClient();

    const { data: topRole, error: topRoleError } = await admin
      .from("roles")
      .select("id, name")
      .order("rank", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (topRoleError || !topRole) {
      return {
        ok: false,
        error: topRoleError?.message ?? "No roles are configured yet.",
      };
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ role_id: topRole.id })
      .eq("id", user.id);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    revalidatePath("/people");
    revalidatePath(`/people/${user.id}`);
    revalidatePath("/people/bootstrap");
    return { ok: true, data: { roleId: topRole.id, roleName: topRole.name } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
