import { z } from "zod";

import { isDiscordUserId } from "@/lib/discord/user-id";

/**
 * Input for the self-service Discord link action. Only the numeric snowflake
 * is accepted: a username or a "Name#1234" tag saved here would make Discord
 * reject every webhook message that mentions this person
 * (lib/discord/user-id.ts). Kept outside the "use server" file so it is
 * unit-testable.
 */
export const linkMyDiscordIdSchema = z.object({
  discordUserId: z
    .string()
    .trim()
    .refine((value) => isDiscordUserId(value), {
      message: "Paste the long number from Copy User ID, not your username.",
    }),
});

export type LinkMyDiscordIdInput = z.infer<typeof linkMyDiscordIdSchema>;
