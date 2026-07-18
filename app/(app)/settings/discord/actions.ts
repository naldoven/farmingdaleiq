"use server";

/**
 * Discord settings server actions (ARCHITECTURE.md "Discord integration";
 * PLAN.md S10: "Discord settings page (webhook URLs server-side only, never
 * sent to client), event route mapping UI").
 *
 * `discord_channels` deliberately has NO RLS SELECT/INSERT/UPDATE/DELETE
 * policy for the `authenticated` role at all (see the P0 breadcrumb in
 * supabase/migrations/20260707001600_notifications_discord.sql and this
 * stream's supabase/migrations/20260707002100_notifications_discord_rls.sql):
 * `webhook_url` must never be reachable from the browser, even by an admin
 * poking the Supabase REST API directly with their own JWT. So every
 * `discord_channels` read/write here uses the SERVICE ROLE client, gated
 * ONLY by `requirePermission("discord.manage")` in this file — there is no
 * RLS backstop for this one table, by design. `discord_event_routes` has no
 * secrets in it, so it keeps the normal pattern: per-request client, RLS
 * re-checks `discord.manage` independently
 * (supabase/migrations/20260707002100_notifications_discord_rls.sql).
 *
 * The channel row itself is never sent back to a Client Component with its
 * `webhook_url` populated — see app/(app)/settings/discord/page.tsx, which
 * only ever reads `id, name, purpose, active` (never `webhook_url`) for
 * rendering, and `updateChannel`'s `webhookUrl` field is write-only (no
 * action here returns it).
 */

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { enqueueDiscordMessage, deliverPendingOutbox } from "@/lib/discord/outbox";
import type { ActionResult } from "@/app/(app)/settings/discord/action-types";
import {
  createChannelSchema,
  deleteChannelSchema,
  sendTestMessageSchema,
  setEventRouteSchema,
  updateChannelSchema,
  type CreateChannelInput,
  type DeleteChannelInput,
  type SendTestMessageInput,
  type SetEventRouteInput,
  type UpdateChannelInput,
} from "@/app/(app)/settings/discord/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  // ZodError extends Error, so this must precede the generic Error branch.
  // Otherwise `error.message` is a raw JSON array of issues (F-SET-1). Join the
  // human-readable issue messages into one friendly line instead.
  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => issue.message)
      .filter(Boolean)
      .join("; ");
    return message || "Please check the form and try again.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

export async function createChannel(input: CreateChannelInput): Promise<ActionResult> {
  try {
    await requirePermission("discord.manage");
    const parsed = createChannelSchema.parse(input);
    const admin = createServiceRoleClient();

    const { error } = await admin.from("discord_channels").insert({
      name: parsed.name,
      webhook_url: parsed.webhookUrl,
      purpose: parsed.purpose ? parsed.purpose : null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/settings/discord");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateChannel(input: UpdateChannelInput): Promise<ActionResult> {
  try {
    await requirePermission("discord.manage");
    const parsed = updateChannelSchema.parse(input);
    const admin = createServiceRoleClient();

    const patch: {
      name?: string;
      purpose?: string | null;
      active?: boolean;
      webhook_url?: string;
    } = {};
    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.purpose !== undefined) patch.purpose = parsed.purpose ? parsed.purpose : null;
    if (parsed.active !== undefined) patch.active = parsed.active;
    if (parsed.webhookUrl) patch.webhook_url = parsed.webhookUrl;

    if (Object.keys(patch).length === 0) {
      return { ok: true, data: undefined };
    }

    const { error } = await admin.from("discord_channels").update(patch).eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/settings/discord");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteChannel(input: DeleteChannelInput): Promise<ActionResult> {
  try {
    await requirePermission("discord.manage");
    const parsed = deleteChannelSchema.parse(input);
    const admin = createServiceRoleClient();

    // Unlink any routes pointing at this channel first (discord_event_routes.channel_id
    // has no ON DELETE CASCADE in the P0 migration) so the delete doesn't
    // fail on a foreign key violation. Also disable them (F-SET-2): an unlinked
    // route has nowhere to deliver, and leaving `enabled = true` would silently
    // reactivate it the moment a new channel is assigned.
    await admin
      .from("discord_event_routes")
      .update({ channel_id: null, enabled: false })
      .eq("channel_id", parsed.id);

    const { error } = await admin.from("discord_channels").delete().eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/settings/discord");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function setEventRoute(input: SetEventRouteInput): Promise<ActionResult> {
  try {
    await requirePermission("discord.manage");
    const parsed = setEventRouteSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("discord_event_routes").upsert({
      event_key: parsed.eventKey,
      channel_id: parsed.channelId,
      enabled: parsed.enabled,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/settings/discord");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Queues a test message on the real outbox path (not a direct fetch) so
 * this exercises the same enqueue -> deliver -> retry pipeline production
 * events use, then immediately triggers one delivery pass so the admin
 * doesn't have to wait for the next scheduled drain
 * (PLAN.md S10 "Done": "outbox drains to a test webhook with retries on
 * failure").
 */
export async function sendTestMessage(
  input: SendTestMessageInput,
): Promise<ActionResult<{ delivered: boolean }>> {
  try {
    await requirePermission("discord.manage");
    const parsed = sendTestMessageSchema.parse(input);

    await enqueueDiscordMessage({
      channelId: parsed.channelId,
      message: { content: "🧪 Test message from FarmingdaleIQ settings." },
      sourceEventId: `test-${crypto.randomUUID()}`,
    });

    const result = await deliverPendingOutbox(5);
    return { ok: true, data: { delivered: result.delivered > 0 } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
