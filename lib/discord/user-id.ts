/**
 * A Discord user id is a numeric snowflake: 17 to 20 digits today. The range
 * is widened to 15 to 25 so a future id length change does not silently stop
 * every ping.
 *
 * One definition shared by the profile form's validation
 * (app/(app)/people/validation.ts) and the message builder
 * (lib/discord/format.ts). If they drifted, a saved id could be rejected by one
 * and accepted by the other. The cost of a bad id is high: Discord answers a
 * `<@jamie>` ping with a 400 on the whole webhook message, the outbox retries
 * 5 times, marks it failed, and the person's post never appears.
 */
export const DISCORD_USER_ID_PATTERN = /^\d{15,25}$/;

export function isDiscordUserId(value: string | null | undefined): value is string {
  return typeof value === "string" && DISCORD_USER_ID_PATTERN.test(value);
}
