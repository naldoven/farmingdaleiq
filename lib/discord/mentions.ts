/**
 * Discord webhooks parse @everyone, @here, and <@id> / <@&role> pings in
 * message content by default. Free text that reaches a webhook (a guest name
 * or special instructions from an inbound catering email, a manager's undo
 * reason) could otherwise ping the whole server. A zero-width space after each
 * "@" keeps the text reading the same but stops Discord from treating it as a
 * mention. Only for text with no intended mentions: the explicit recipient
 * mention in lib/discord/format.ts is added after any free text is built.
 */
export function neutralizeDiscordMentions(text: string): string {
  return text.replace(/@/g, "@​");
}
