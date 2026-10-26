import type { EventKey, EventPayload } from "@/lib/events/bus";
import type { DiscordAllowedMentions, DiscordWebhookMessage } from "@/lib/discord/client";
import { enabledEventKeys } from "@/lib/features";
import { isDiscordUserId } from "@/lib/discord/user-id";

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
  "catering_tomorrow_digest",
  // Cleaning -> #cleaning (item names only, never people)
  "cleaning_daily_summary",
  "cleaning_week_published",
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
  catering_tomorrow_digest: "🍽️",
  cleaning_daily_summary: "🧽",
  cleaning_week_published: "🗓️",
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
  catering_tomorrow_digest: "Tomorrow's catering",
  cleaning_daily_summary: "Cleaning summary",
  cleaning_week_published: "Cleaning week is live",
};

/**
 * Discord rejects a webhook `content` over 2000 characters with a 400, and a
 * rejected post burns through the outbox retries and is lost. A broadcast body
 * alone may be 2000 characters (app/(app)/team/validation.ts), so the
 * assembled message must be clamped, keeping the mention at the end intact.
 */
export const DISCORD_CONTENT_MAX_CHARS = 2000;

function assembleContent(title: string, detail: string | undefined, mentionText: string): string {
  const separator = ": ";
  const tail = mentionText ? `${separator}${mentionText}` : "";
  let content = detail ? `${title}${separator}${detail}` : title;
  const budget = DISCORD_CONTENT_MAX_CHARS - tail.length;
  if (content.length > budget) {
    // Trim the user-typed detail, never the mention: a cut-off body is still
    // readable, a cut-off <@id> is a broken ping.
    content = `${content.slice(0, Math.max(0, budget - 1))}…`;
  }
  return `${content}${tail}`;
}

function mention(discordUserId: string): string {
  return `<@${discordUserId}>`;
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
    return {
      content: `${emoji} A private accountability event was recorded in FarmingdaleIQ.`,
      allowed_mentions: { parse: [] },
    };
  }

  const title =
    (typeof payload.title === "string" && payload.title) ||
    DEFAULT_TITLES[key] ||
    key;
  const detail =
    (typeof payload.message === "string" && payload.message) ||
    (typeof payload.body === "string" && payload.body) ||
    undefined;
  // A stored id that is not a real snowflake (an older row, or a value written
  // around the form) must not reach Discord: a malformed `<@id>` or `users`
  // entry makes it reject the whole message with a 400, and the post is lost
  // once the outbox runs out of retries. Fall back to a plain, no-ping post.
  const recipientId = isDiscordUserId(opts.recipientDiscordId)
    ? opts.recipientDiscordId
    : undefined;
  const mentionText = recipientId ? mention(recipientId) : "";

  const content = assembleContent(`${emoji} **${title}**`, detail, mentionText);

  // `content` carries user-typed text (title, message, body), so Discord must
  // never be left to parse mentions out of it: a typed "@everyone" would ping
  // the whole server. The recipient's own <@id> is the only intended ping, so
  // it is the only id re-allowed.
  const allowed_mentions: DiscordAllowedMentions = recipientId
    ? { parse: [], users: [recipientId] }
    : { parse: [] };

  return { content, allowed_mentions };
}
