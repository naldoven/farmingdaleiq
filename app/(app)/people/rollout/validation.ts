import { z } from "zod";

/**
 * Input for the Rollout email check. The cap keeps a runaway paste from
 * turning into a huge compare; 5000 characters is several hundred addresses.
 */
export const checkInviteListSchema = z.object({
  emails: z.string().max(5000, "That list is too long. Paste 5000 characters or fewer."),
});

export type CheckInviteListInput = z.infer<typeof checkInviteListSchema>;
