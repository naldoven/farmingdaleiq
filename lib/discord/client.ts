/**
 * Discord's `allowed_mentions` object. Webhooks parse @everyone, @here,
 * <@id> and <@&role> out of `content` by default, so anything free-typed by a
 * user (feed posts, catering guest names, maintenance requests) could ping the
 * whole server. An empty `parse` turns all of that off; `users` then re-allows
 * only the listed ids.
 */
export type DiscordAllowedMentions = {
  parse: Array<"users" | "roles" | "everyone">;
  users?: string[];
};

// `type` aliases, not interfaces: the outbox stores the whole message in a
// jsonb column, and only type aliases are assignable to the generated `Json`
// type (interfaces have no implicit index signature).
export type DiscordWebhookMessage = {
  content: string;
  allowed_mentions?: DiscordAllowedMentions;
};

/**
 * POSTs one message to a Discord incoming webhook (ARCHITECTURE.md "Discord
 * integration" > Transport). Throws on any non-2xx response so callers
 * (lib/discord/outbox.ts) can drive their own retry/backoff bookkeeping.
 *
 * A message without `allowed_mentions` is sent with `{ parse: [] }` (no pings
 * at all). That default covers rows already queued in `discord_outbox` before
 * buildDiscordMessage started setting the field, and any future caller that
 * forgets it. Pinging someone has to be asked for explicitly.
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  message: DiscordWebhookMessage,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...message,
      allowed_mentions: message.allowed_mentions ?? { parse: [] },
    }),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook responded with ${res.status}`);
  }
}
