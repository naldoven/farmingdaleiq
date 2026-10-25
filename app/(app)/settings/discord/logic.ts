/**
 * Pure helpers for the Discord settings screen (rollout pack, PR 2).
 *
 * "Silent" means an event the app can emit that will never reach Discord as
 * things stand. The route table already shows every row, but a manager
 * scanning sixteen dropdowns cannot tell at a glance which ones are still
 * dead, and the rollout found that nothing had been routed at all. This
 * reduces the table to the short list that still needs a decision.
 */

export type SilentReason = "no_route" | "no_channel" | "disabled" | "channel_inactive";

export interface SilentEvent {
  eventKey: string;
  reason: SilentReason;
}

export interface RouteLike {
  event_key: string;
  channel_id: string | null;
  enabled: boolean;
}

export interface ChannelLike {
  id: string;
  active: boolean;
}

/**
 * Mirrors the delivery rule in lib/discord/routes.ts `getDiscordRoute`: a
 * message goes out only when the route exists, is enabled, points at a
 * channel, and that channel is active. Anything else is silent. Order follows
 * `eventKeys` so the list reads the same way as the route table above it.
 */
export function silentEventKeys(
  eventKeys: readonly string[],
  routes: readonly RouteLike[],
  channels: readonly ChannelLike[],
): SilentEvent[] {
  const routeByKey = new Map(routes.map((route) => [route.event_key, route]));
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));

  const silent: SilentEvent[] = [];
  for (const eventKey of eventKeys) {
    const route = routeByKey.get(eventKey);
    if (!route) {
      silent.push({ eventKey, reason: "no_route" });
      continue;
    }
    if (!route.channel_id) {
      silent.push({ eventKey, reason: "no_channel" });
      continue;
    }
    if (!route.enabled) {
      silent.push({ eventKey, reason: "disabled" });
      continue;
    }
    const channel = channelById.get(route.channel_id);
    if (!channel || !channel.active) {
      silent.push({ eventKey, reason: "channel_inactive" });
    }
  }
  return silent;
}

export const SILENT_REASON_LABELS: Record<SilentReason, string> = {
  no_route: "No channel picked",
  no_channel: "No channel picked",
  disabled: "Turned off",
  channel_inactive: "Channel is inactive",
};
