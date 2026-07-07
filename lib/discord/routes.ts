import { createServiceRoleClient } from "@/lib/supabase/server";
import type { EventKey } from "@/lib/events/bus";

export interface DiscordRoute {
  channelId: string;
  webhookUrl: string;
}

/**
 * Looks up the Discord destination for one event key: `discord_event_routes`
 * (event_key -> channel_id, enabled) joined to `discord_channels` for the
 * webhook URL.
 *
 * Both reads use the SERVICE ROLE client, not the per-request one. Per the
 * P0 breadcrumb on `discord_channels`
 * ("supabase/migrations/20260707001600_notifications_discord.sql": "webhook_url
 * is server-side only: no RLS SELECT policy exposes it to the browser (P1
 * S10 owns the RLS policies for this table)") and the migration this stream
 * adds (supabase/migrations/20260707002100_notifications_discord_rls.sql),
 * `discord_channels` intentionally has NO authenticated-role SELECT policy
 * at all — the only way to read `webhook_url`, ever, is trusted server code
 * using the service-role client. This mirrors the one documented exception
 * in app/(app)/people/actions.ts (`inviteUser` using the admin API): a
 * deliberate, narrow use of the service-role client for something RLS
 * cannot express, not a general bypass.
 *
 * Returns null when the route is missing, disabled, or the channel is
 * inactive/gone — callers must treat that as "skip Discord for this event",
 * not as an error.
 */
export async function getDiscordRoute(
  eventKey: EventKey,
  client: ReturnType<typeof createServiceRoleClient> = createServiceRoleClient(),
): Promise<DiscordRoute | null> {
  const supabase = client;

  const { data: route } = await supabase
    .from("discord_event_routes")
    .select("channel_id, enabled")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (!route || !route.enabled || !route.channel_id) {
    return null;
  }

  const { data: channel } = await supabase
    .from("discord_channels")
    .select("id, webhook_url, active")
    .eq("id", route.channel_id)
    .maybeSingle();

  if (!channel || !channel.active) {
    return null;
  }

  return { channelId: channel.id, webhookUrl: channel.webhook_url };
}
