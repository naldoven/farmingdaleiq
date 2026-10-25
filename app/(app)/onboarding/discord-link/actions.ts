"use server";

/**
 * Self-service Discord link (rollout pack, PR 1). Three actions behind the
 * first-login step app/(app)/layout.tsx shows to anyone with no Discord id:
 * save my own id, send myself a test ping, skip for now.
 *
 * None of these calls requirePermission(): every seeded role may link its own
 * Discord, the same way `updateOwnProfile` (app/(app)/people/actions.ts) is
 * self-service. Each one resolves the caller from the auth session and only
 * ever touches that caller's own row.
 *
 * Why `linkMyDiscordId` writes with the service-role client. The
 * `profile_private_guard` trigger (supabase/migrations/20260718020000_
 * profiles_private_pii.sql) only lets people.manage holders or the service
 * role change `discord_user_id`; it was written when the field was typed by
 * admins and nobody validated the value. The alternative was a migration
 * loosening that guard, which the rollout pack asks to avoid when possible.
 * So the write goes through the trusted server path, narrowed in code to:
 * the signed-in user's own `profile_id`, a value the zod schema has already
 * proven numeric, and only while the stored value is still the one just read
 * (null, or an old hand-typed value that is not a real id). Corrections after
 * that stay manager-only on the People profile page, where the guard still
 * applies. This is the same "narrow, deliberate service-role use for something
 * RLS cannot express" precedent as `inviteUser`.
 *
 * There is deliberately no `revalidatePath` in the save path. In Next 16 a
 * revalidation inside a Server Action re-renders the page in the same
 * response; the layout would then see the saved id, drop the gate, and the
 * person would never reach the test ping step. The "Done" button refreshes.
 */

import { cookies } from "next/headers";
import { ZodError } from "zod";

import { toActionError } from "@/lib/errors/action-error";
import { DISCORD_ID_TAKEN_MESSAGE, isUniqueViolation } from "@/lib/discord/id-conflict";
import { getDiscordRoute } from "@/lib/discord/routes";
import { deliverPendingOutbox, enqueueDiscordMessage } from "@/lib/discord/outbox";
import { isDiscordUserId } from "@/lib/discord/user-id";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/onboarding/discord-link/action-types";
import {
  DISCORD_LINK_SKIP_COOKIE,
  DISCORD_LINK_SKIP_MAX_AGE_SECONDS,
  MAX_TEST_PINGS_PER_DAY,
  TEST_PING_WINDOW_MS,
  buildDiscordTestPing,
  testPingSourceEventId,
  testPingSourceEventPrefix,
} from "@/app/(app)/onboarding/discord-link/logic";
import {
  linkMyDiscordIdSchema,
  type LinkMyDiscordIdInput,
} from "@/app/(app)/onboarding/discord-link/validation";

/**
 * Only a validation message is safe to show as written. Anything else thrown
 * here could be database or configuration text, which the person cannot act on
 * and should not see, so it becomes a plain retry line.
 */
function safeActionError(error: unknown): string {
  if (error instanceof ZodError) return toActionError(error);
  return "Something went wrong. Please try again.";
}

export async function linkMyDiscordId(input: LinkMyDiscordIdInput): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const parsed = linkMyDiscordIdSchema.parse(input);

    // Read through the per-request client: RLS (profiles_private_select_self_
    // or_manager) only returns the caller's own row, so a missing row here
    // means the profile really does not exist, not that access was denied.
    const { data: current, error: readError } = await supabase
      .from("profiles_private")
      .select("discord_user_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (readError) {
      return { ok: false, error: "We couldn't load your profile. Please try again." };
    }
    if (!current) {
      return { ok: false, error: "Your profile is not set up yet. Ask a manager." };
    }
    if (isDiscordUserId(current.discord_user_id)) {
      // Saving the same id again is a retry (a dropped response, a second tap
      // after the first one landed), not a change: report success so the
      // person is not told to ask a manager about an id that is already theirs.
      if (current.discord_user_id === parsed.discordUserId) {
        return { ok: true, data: undefined };
      }
      return {
        ok: false,
        error: "Your Discord is already linked. Ask a manager to change it.",
      };
    }

    // One Discord account per person. Without this, someone could paste a
    // coworker's id (or a leader's) and have their own events ping that
    // account, and two rows with the same id would make a lookup by Discord
    // id ambiguous. The check reads past RLS on purpose: the caller must not
    // be able to see whose row it is, only that the id is taken. It fails
    // closed: if the lookup itself errors we cannot say the id is free, so the
    // save is refused. The unique index profiles_private_discord_user_id_uq
    // (migration 20261025020000) is the real guarantee; this read exists to
    // give the friendly message before the write instead of after it.
    const admin = createServiceRoleClient();
    const { data: taken, error: takenError } = await admin
      .from("profiles_private")
      .select("profile_id")
      .eq("discord_user_id", parsed.discordUserId)
      .neq("profile_id", user.id)
      .limit(1)
      .maybeSingle();
    if (takenError) {
      return { ok: false, error: "We couldn't check that Discord ID right now. Please try again." };
    }
    if (taken) {
      return { ok: false, error: DISCORD_ID_TAKEN_MESSAGE };
    }

    // Conditional write: change the row only while it still holds exactly what
    // was read above (null, or the old non-id value). Two saves racing each
    // other cannot both win: the loser matches zero rows. The payload is the
    // one column, the filter on profile_id is the caller's own id.
    const base = admin
      .from("profiles_private")
      .update({ discord_user_id: parsed.discordUserId })
      .eq("profile_id", user.id);
    const guarded =
      current.discord_user_id === null
        ? base.is("discord_user_id", null)
        : base.eq("discord_user_id", current.discord_user_id);
    const { data: updated, error } = await guarded.select("profile_id");
    if (error) {
      return {
        ok: false,
        error: isUniqueViolation(error)
          ? DISCORD_ID_TAKEN_MESSAGE
          : "We couldn't save your Discord ID. Please try again.",
      };
    }
    if (!updated || updated.length === 0) {
      return {
        ok: false,
        error: "Your Discord ID changed while saving. Refresh the page and check it.",
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: safeActionError(error) };
  }
}

/**
 * Posts a ping that mentions the caller to the channel routed for
 * `recognition` (the one channel every leader is expected to watch), through
 * the normal outbox so the real enqueue -> deliver -> retry path is what gets
 * tested. `queued: false` means a message for this person already exists in
 * this minute and nothing new was posted.
 */
export async function sendMyDiscordTestPing(): Promise<
  ActionResult<{ queued: boolean; delivered: boolean }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const { data: current, error: readError } = await supabase
      .from("profiles_private")
      .select("discord_user_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (readError) {
      return { ok: false, error: "We couldn't load your profile. Please try again." };
    }
    if (!isDiscordUserId(current?.discord_user_id)) {
      return { ok: false, error: "Save your Discord ID first." };
    }

    const route = await getDiscordRoute("recognition");
    if (!route) {
      return {
        ok: false,
        error: "No Discord channel is set up for recognition yet. Ask a manager to add one.",
      };
    }

    // Daily cap, counted from the outbox itself so it needs no new table: every
    // ping this person queued carries their prefix in payload.source_event_id.
    // Service role because discord_outbox has no authenticated read policy.
    // Fails closed: a count we could not read is not a count of zero, so a
    // failed query refuses the ping instead of letting the cap be skipped.
    const admin = createServiceRoleClient();
    const since = new Date(Date.now() - TEST_PING_WINDOW_MS).toISOString();
    const { count: sentToday, error: countError } = await admin
      .from("discord_outbox")
      .select("id", { count: "exact", head: true })
      .like("payload->>source_event_id", `${testPingSourceEventPrefix(user.id)}%`)
      .gte("created_at", since);
    if (countError || sentToday === null) {
      return { ok: false, error: "We couldn't check your test ping limit. Please try again." };
    }
    if (sentToday >= MAX_TEST_PINGS_PER_DAY) {
      return {
        ok: false,
        error: `You have sent ${MAX_TEST_PINGS_PER_DAY} test pings today. Try again tomorrow, or ask a manager to check your ID.`,
      };
    }

    const { queued } = await enqueueDiscordMessage({
      channelId: route.channelId,
      message: buildDiscordTestPing(current.discord_user_id),
      sourceEventId: testPingSourceEventId(user.id),
    });
    if (!queued) {
      return { ok: true, data: { queued: false, delivered: false } };
    }

    const result = await deliverPendingOutbox(5);
    return { ok: true, data: { queued: true, delivered: result.delivered > 0 } };
  } catch (error) {
    return { ok: false, error: safeActionError(error) };
  }
}

/**
 * Hides the step for this user on this device for one window (see
 * DISCORD_LINK_SKIP_MAX_AGE_SECONDS). The cookie carries the user id so it
 * cannot hide the step from a different person on a shared phone.
 */
export async function skipDiscordLinkForNow(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const cookieStore = await cookies();
    cookieStore.set(DISCORD_LINK_SKIP_COOKIE, user.id, {
      maxAge: DISCORD_LINK_SKIP_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: safeActionError(error) };
  }
}
