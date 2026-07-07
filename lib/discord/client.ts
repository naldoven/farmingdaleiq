export interface DiscordWebhookMessage {
  content: string;
}

/**
 * POSTs one message to a Discord incoming webhook (ARCHITECTURE.md "Discord
 * integration" > Transport). Throws on any non-2xx response so callers
 * (lib/discord/outbox.ts) can drive their own retry/backoff bookkeeping.
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  message: DiscordWebhookMessage,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook responded with ${res.status}`);
  }
}
