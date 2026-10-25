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
  buildDiscordTestPing,
  testPingSourceEventId,
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

    // Double-submit note: two taps write the same value the same person typed
    // to the same row, so the second write is harmless rather than a hazard.
    const admin = createServiceRoleClient();
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
