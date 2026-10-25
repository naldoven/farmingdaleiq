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
 * proven numeric, and only while no valid id is stored yet. Corrections after
 * that stay admin-only on the People profile page, where the guard still
 * applies. This is the same "narrow, deliberate service-role use for something
 * RLS cannot express" precedent as `inviteUser`.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { toActionError } from "@/lib/errors/action-error";
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
      return { ok: false, error: readError.message };
    }
    if (!current) {
      return { ok: false, error: "Your profile is not set up yet. Ask a manager." };
    }
    if (isDiscordUserId(current.discord_user_id)) {
      return {
        ok: false,
        error: "Your Discord is already linked. Ask a manager to change it.",
      };
    }

    // One Discord account per person. Without this, someone could paste a
    // coworker's id (or a leader's) and have their own events ping that
    // account, and two rows with the same id would make a lookup by Discord
    // id ambiguous. The check reads past RLS on purpose: the caller must not
    // be able to see whose row it is, only that the id is taken. A partial
    // unique index would make this airtight; that needs a migration, so for
    // now the race window between this read and the write is accepted and
    // noted in the rollout report.
    const admin = createServiceRoleClient();
    const { data: taken } = await admin
      .from("profiles_private")
      .select("profile_id")
      .eq("discord_user_id", parsed.discordUserId)
      .neq("profile_id", user.id)
      .limit(1)
      .maybeSingle();
    if (taken) {
      return {
        ok: false,
        error: "That Discord ID is already linked to another account. Ask a manager.",
      };
    }

    // Double-submit note: two taps write the same value the same person typed
    // to the same row, so the second write is harmless rather than a hazard.
    const { error } = await admin
      .from("profiles_private")
      .update({ discord_user_id: parsed.discordUserId })
      .eq("profile_id", user.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
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

    const { data: current } = await supabase
      .from("profiles_private")
      .select("discord_user_id")
      .eq("profile_id", user.id)
      .maybeSingle();
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
    const admin = createServiceRoleClient();
    const since = new Date(Date.now() - TEST_PING_WINDOW_MS).toISOString();
    const { count: sentToday } = await admin
      .from("discord_outbox")
      .select("id", { count: "exact", head: true })
      .like("payload->>source_event_id", `${testPingSourceEventPrefix(user.id)}%`)
      .gte("created_at", since);
    if ((sentToday ?? 0) >= MAX_TEST_PINGS_PER_DAY) {
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
    return { ok: false, error: toActionError(error) };
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
    return { ok: false, error: toActionError(error) };
  }
}
