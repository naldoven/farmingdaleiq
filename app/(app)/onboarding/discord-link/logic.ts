import type { DiscordWebhookMessage } from "@/lib/discord/client";
import { isDiscordUserId } from "@/lib/discord/user-id";

/**
 * Pure rules for the first-login Discord link step (rollout pack, PR 1).
 * Kept free of I/O so the gate decision, the ping text, and the
 * double-submit guard are unit-testable without the server runtime.
 */

/**
 * Cookie that records "this person skipped the Discord step for now". Its
 * value is the user id it was set for, so a second person signing in on a
 * shared device still sees the step. Short-lived on purpose: the step must
 * come back at the next login until the id is actually saved, and a session
 * cookie is not reliable for that in an installed PWA (iOS keeps them for
 * weeks), so a fixed 12 hour window stands in for "next login".
 */
export const DISCORD_LINK_SKIP_COOKIE = "fiq_discord_link_skip";
export const DISCORD_LINK_SKIP_MAX_AGE_SECONDS = 12 * 60 * 60;

/**
 * Show the step when the stored id is missing or not a real numeric id (an
 * older hand-typed username would never ping, so it counts as unlinked), and
 * the person has not skipped it in this window.
 */
export function needsDiscordLink(input: {
  discordUserId: string | null | undefined;
  skipCookieValue: string | null | undefined;
  userId: string;
}): boolean {
  if (isDiscordUserId(input.discordUserId)) return false;
  return input.skipCookieValue !== input.userId;
}

/**
 * Idempotency key for the test ping. The outbox dedupes on
 * (channel, source_event_id), so a double tap or a stuck "Send" button within
 * the same minute queues one message, not two. A minute later the person can
 * deliberately send another, which they need if the first one went to the
 * wrong account.
 */
export function testPingSourceEventId(userId: string, now: Date = new Date()): string {
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  return `discord-link-test-${userId}-${minuteBucket}`;
}

/**
 * The test message. Only the person's own id is re-allowed as a mention; the
 * rest of the content is fixed text, so there is nothing else Discord could
 * parse into a ping.
 */
export function buildDiscordTestPing(discordUserId: string): DiscordWebhookMessage {
  return {
    content: `👋 <@${discordUserId}> Test ping from FarmingdaleIQ. If you can see this, your Discord is linked.`,
    allowed_mentions: { parse: [], users: [discordUserId] },
  };
}
