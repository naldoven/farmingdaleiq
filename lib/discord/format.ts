import type { EventKey, EventPayload } from "@/lib/events/bus";
import type { DiscordWebhookMessage } from "@/lib/discord/client";
import { enabledEventKeys } from "@/lib/features";

/**
 * Event keys Discord auto-posts (ARCHITECTURE.md "Discord integration" >
 * Auto-post routes), grouped by the four route buckets named there. This is
 * the full set of `discord_event_routes` rows S10 seeds/manages via
 * `/settings/discord`.
 */
export const DISCORD_ROUTABLE_EVENT_KEYS: EventKey[] = enabledEventKeys([
  // Overdue & incomplete -> leaders channel
  "task_overdue",
  "checklist_missed",
  "break_overdue",
  "temp_failed",
  // Maintenance -> #maintenance
  "maint_request",
  "work_order_status",
  "equipment_down",
  "equipment_up",
  "pm_due",
  // Wins & announcements -> #team
  "recognition",
  "top_performer",
  "broadcast",
  // Reward claims -> leaders channel
  "reward_claim",
  // Catering
  "catering_order_new",
  "catering_stage_change",
]);

/**
 * Accountability events are deliberately absent from
 * DISCORD_ROUTABLE_EVENT_KEYS. Keeping this redaction as a second guard means
 * an accidental direct call can never disclose a team member's identity,
 * points, note, or infraction type to Discord.
 */
const PRIVACY_REDACTED_KEYS = new Set<EventKey>([
  "infraction_issued",
  "disciplinary_triggered",
]);

const EMOJI: Partial<Record<EventKey, string>> = {
  task_overdue: "⏰",
  checklist_missed: "📋",
  break_overdue: "🛑",
  temp_failed: "🌡️",
  maint_request: "🔧",
  work_order_status: "🛠️",
  equipment_down: "🔴",
  equipment_up: "🟢",
  pm_due: "🗓️",
  recognition: "🎉",
  top_performer: "🏆",
  broadcast: "📣",
  reward_claim: "🎁",
  catering_order_new: "🍽️",
  catering_stage_change: "🍽️",
  infraction_issued: "⚠️",
  disciplinary_triggered: "⚠️",
};

const DEFAULT_TITLES: Partial<Record<EventKey, string>> = {
  task_overdue: "Task overdue",
  checklist_missed: "Checklist missed",
  break_overdue: "Break overdue",
  temp_failed: "Out-of-range temperature",
  maint_request: "New maintenance request",
  work_order_status: "Work order updated",
  equipment_down: "Equipment down",
  equipment_up: "Equipment back up",
  pm_due: "Preventive maintenance due",
  recognition: "Recognition",
  top_performer: "Top Performer",
  broadcast: "Announcement",
  reward_claim: "Reward claim submitted",
  catering_order_new: "New catering order",
  catering_stage_change: "Catering order stage change",
};

function mention(discordUserId: string | null | undefined): string {
  return discordUserId ? `<@${discordUserId}>` : "";
}

export interface BuildDiscordMessageOptions {
  /** Display name to use when a payload has no better title (e.g. "Jamie Rivera"). */
  recipientName?: string;
  /** profiles.discord_user_id of the person the event concerns, for @mentions. */
  recipientDiscordId?: string | null;
}

/**
 * Formats one `app_events` row into a Discord webhook message. Pure (no I/O)
 * so routing/lookup logic (lib/discord/routes.ts, profile lookups) stays
 * out of this function and it's directly unit-testable, including the
 * privacy-redaction guarantee above.
 */
export function buildDiscordMessage(
  key: EventKey,
  payload: EventPayload,
  opts: BuildDiscordMessageOptions = {},
): DiscordWebhookMessage {
  const emoji = EMOJI[key] ?? "🔔";

  if (PRIVACY_REDACTED_KEYS.has(key)) {
    return { content: `${emoji} A private accountability event was recorded in FarmingdaleIQ.` };
  }

  const title =
    (typeof payload.title === "string" && payload.title) ||
    DEFAULT_TITLES[key] ||
    key;
  const detail =
    (typeof payload.message === "string" && payload.message) ||
    (typeof payload.body === "string" && payload.body) ||
    undefined;
  const mentionText = mention(opts.recipientDiscordId);

  const parts = [`${emoji} **${title}**`];
  if (detail) parts.push(detail);
  if (mentionText) parts.push(mentionText);

  return { content: parts.join(" — ") };
}
