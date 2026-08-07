import { z } from "zod";

const optionalUuid = z.string().uuid().optional().or(z.literal("")).transform((value) => value || undefined);
const optionalText = z.string().trim().max(2_000).optional().or(z.literal("")).transform((value) => value || undefined);

/** Input accepted by the account-free maintenance portal. Kept separate from
 * the internal action schema because this route has tighter size limits and
 * includes an idempotency key supplied by an anonymous browser. */
export const publicMaintenanceRequestSchema = z.object({
  submissionId: z.string().uuid(),
  title: z.string().trim().min(1, "Tell us what needs attention").max(200),
  description: optionalText,
  equipmentId: optionalUuid,
  photoUrls: z.array(z.string().url().max(2_000)).max(6).default([]),
});

export type PublicMaintenanceRequestInput = z.infer<typeof publicMaintenanceRequestSchema>;
