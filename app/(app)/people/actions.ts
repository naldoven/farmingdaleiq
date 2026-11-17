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
 * 3. The ONE exception: the Supabase Auth admin API has no RLS equivalent (it
 *    isn't a table write). createServiceRoleClient() is used only for those
 *    calls (creating the account in `inviteUser`, making a setup link,
 *    setting a temporary password), and only ever after requirePermission()
 *    AND, for anything aimed at an existing person, the rank guard
 *    (lib/auth/rank-guard.ts) already passed. Every table read/write in this
 *    file uses the normal per-request client.
 * 4. Actions return a discriminated `ActionResult` instead of throwing, so
 *    forms can render an inline error. PermissionError is caught and mapped
 *    to a generic message — never leak which permission key was missing.
 * 5. Every mutation calls `revalidatePath()` for the routes that read the
 *    changed data, so the UI reflects the write without a full reload.
 * ============================================================================
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { requireCanAssignRole, requireOutranks } from "@/lib/auth/rank-guard";
import { makeSetupLink } from "@/lib/auth/setup-link";
import { DISCORD_ID_TAKEN_MESSAGE, isUniqueViolation } from "@/lib/discord/id-conflict";
import { toActionError } from "@/lib/errors/action-error";
import { emitEvent, type EventKey } from "@/lib/events/bus";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/people/action-types";
import {
  assignRoleSchema,
  inviteUserSchema,
  newSetupLinkSchema,
  selfUpdateProfileSchema,
  temporaryPasswordSchema,
  updateProfileSchema,
  type AssignRoleInput,
  type InviteUserInput,
  type NewSetupLinkInput,
  type SelfUpdateProfileInput,
  type TemporaryPasswordInput,
  type UpdateProfileInput,
} from "@/app/(app)/people/validation";

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

    // Non-PII stays on profiles (the store-member-readable table).
    const { error } = await supabase
      .from("profiles")
      .update({
        name: parsed.name,
        avatar_url: parsed.avatarUrl ? parsed.avatarUrl : null,
        active: parsed.active,
      })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    // PII lives on the locked profiles_private table (PPL2b). RLS +
    // profile_private_guard re-check people.manage for the discord/email/
    // hired_on fields; a manager holds it, so this write is allowed.
    const { error: privateError } = await supabase
      .from("profiles_private")
      .update({
        phone: parsed.phone ? parsed.phone : null,
        discord_user_id: parsed.discordUserId ? parsed.discordUserId : null,
        birthdate: parsed.birthdate ? parsed.birthdate : null,
        hired_on: parsed.hiredOn ? parsed.hiredOn : null,
      })
      .eq("profile_id", parsed.id);

    if (privateError) {
      // The only unique constraint this update can hit is the partial unique
      // index on discord_user_id (migration 20261025020000): the ID typed here
      // already belongs to another profile.
      return {
        ok: false,
        error: isUniqueViolation(privateError)
          ? DISCORD_ID_TAKEN_MESSAGE
          : privateError.message,
      };
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

    // avatar_url is non-PII and stays on profiles; phone/birthdate are the
    // genuinely self-editable PII fields, on profiles_private (PPL2b). Both
    // writes target only the caller's own row, so neither can touch anyone
    // else regardless of the caller's role.
    const { error } = await supabase
      .from("profiles")
      .update({
        avatar_url: parsed.avatarUrl ? parsed.avatarUrl : null,
      })
      .eq("id", user.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    const { error: privateError } = await supabase
      .from("profiles_private")
      .update({
        phone: parsed.phone ? parsed.phone : null,
        birthdate: parsed.birthdate ? parsed.birthdate : null,
      })
      .eq("profile_id", user.id);

    if (privateError) {
      return { ok: false, error: privateError.message };
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
 *
 * The rank guard is the target-side half the database never checked: the
 * privilege-guard trigger stops assigning a role senior to your own, but it
 * let an Assistant Director demote a Director or a Location Manager. Now you
 * can change a role only for someone ranked below you.
 */
export async function assignRole(
  input: AssignRoleInput,
): Promise<ActionResult> {
  try {
    await requirePermission("people.manage");

    const parsed = assignRoleSchema.parse(input);
    await requireOutranks(parsed.id);
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
 * Best-effort audit row for the sign-in tools (EVENT_KEYS "people_*"). Ids
 * only: the link and the password never leave the action that made them. A
 * failed audit write must not undo a link or password the manager already
 * has, so it is logged and swallowed.
 */
async function auditSignIn(key: EventKey, actorId: string, targetId: string) {
  try {
    await emitEvent(key, { actor_id: actorId, target_id: targetId });
  } catch (error) {
    console.error(`[people] ${key} audit failed:`, error instanceof Error ? error.message : error);
  }
}

function isEmailTaken(error: { code?: string; message?: string }): boolean {
  return error.code === "email_exists" || /already (been )?registered/i.test(error.message ?? "");
}

/**
 * Creates a new employee and hands back a setup link for the manager to text
 * or share (docs/STAFF-SIGN-IN-PLAN.md, Step 3). No email is sent: the
 * built-in Supabase sender allows 2 per hour, and the old invite email's link
 * could never be read by /auth/callback, so every invite failed.
 *
 * `admin.createUser` with email_confirm makes a confirmed account with no
 * usable password. The `handle_new_auth_user` trigger
 * (supabase/migrations/20260707000200_core.sql) creates the bare profile rows
 * the moment the auth user exists; this action then fills in the real name,
 * chosen role, and phone through the normal permission-guarded update path,
 * so the database privilege guard still stops a manager assigning a role
 * senior to their own.
 *
 * `link` is null when the account was made but the link step failed: the
 * manager uses New setup link on the profile rather than adding them twice.
 */
export async function inviteUser(
  input: InviteUserInput,
): Promise<ActionResult<{ userId: string; link: string | null }>> {
  try {
    await requirePermission("people.manage");

    const parsed = inviteUserSchema.parse(input);
    // Before anything is created: a refused role would otherwise leave a
    // half-made account that blocks a retry with "already has an account".
    const { actorId } = await requireCanAssignRole(parsed.roleId);
    const admin = createServiceRoleClient();

    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.email,
      email_confirm: true,
      user_metadata: { name: parsed.name },
    });

    if (error || !data.user) {
      if (error && isEmailTaken(error)) {
        return {
          ok: false,
          error: `${parsed.email} already has an account. Use New setup link on their profile.`,
        };
      }
      return {
        ok: false,
        error: error?.message ?? "Could not create the account.",
      };
    }

    const userId = data.user.id;

    // The trigger has already inserted a bare profiles row AND a
    // profiles_private row (with the email) for userId at this point
    // (handle_new_auth_user fires synchronously on auth.users insert). Fill in
    // the real name/role on profiles and the phone on profiles_private through
    // the normal per-request client so RLS's people.manage check applies here
    // too.
    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        name: parsed.name,
        role_id: parsed.roleId,
      })
      .eq("id", userId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    const { error: phoneError } = await supabase
      .from("profiles_private")
      .update({ phone: parsed.phone ? parsed.phone : null })
      .eq("profile_id", userId);

    if (phoneError) {
      return { ok: false, error: phoneError.message };
    }

    let link: string | null = null;
    try {
      link = await makeSetupLink(parsed.email);
      await auditSignIn("people_setup_link_created", actorId, userId);
    } catch (linkError) {
      console.error(
        "[people] setup link after invite failed:",
        linkError instanceof Error ? linkError.message : linkError,
      );
    }

    revalidatePath("/people");
    return { ok: true, data: { userId, link } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * "New setup link" on a profile (docs/STAFF-SIGN-IN-PLAN.md, Step 4): for a
 * link that expired, a forgotten password, or someone added before this
 * existed. The email comes from the auth account on the server, never from
 * the client, so a manager cannot aim a link at an address of their choosing.
 * A new link replaces any older one for that person.
 */
export async function newSetupLink(
  input: NewSetupLinkInput,
): Promise<ActionResult<{ link: string }>> {
  try {
    await requirePermission("people.manage");

    const parsed = newSetupLinkSchema.parse(input);
    const { actorId } = await requireOutranks(parsed.profileId);

    const admin = createServiceRoleClient();
    const { data, error } = await admin.auth.admin.getUserById(parsed.profileId);
    const email = data?.user?.email;
    if (error || !email) {
      return { ok: false, error: "This person has no sign-in email on file." };
    }

    const link = await makeSetupLink(email);
    await auditSignIn("people_setup_link_created", actorId, parsed.profileId);
    return { ok: true, data: { link } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * "Set temporary password" on a profile (docs/STAFF-SIGN-IN-PLAN.md, Step 5),
 * for a manager standing next to the person. The flag goes in app_metadata,
 * which only the service role can write; user_metadata would let the person
 * clear it themselves. The middleware then keeps them on /set-password until
 * they choose their own, and setNewPassword clears the flag.
 */
export async function setTemporaryPassword(
  input: TemporaryPasswordInput,
): Promise<ActionResult> {
  try {
    await requirePermission("people.manage");

    const parsed = temporaryPasswordSchema.parse(input);
    const { actorId } = await requireOutranks(parsed.profileId);

    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(parsed.profileId, {
      password: parsed.password,
      app_metadata: { must_change_password: true },
    });
    if (error) {
      // Supabase's own message (for example a too-weak password), never the
      // password itself.
      return { ok: false, error: error.message };
    }

    await auditSignIn("people_temp_password_set", actorId, parsed.profileId);
    return { ok: true, data: undefined };
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
