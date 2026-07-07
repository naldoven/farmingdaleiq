import { z } from "zod";

export const markNotificationReadSchema = z.object({
  id: z.string().uuid(),
});

export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>;

export const savePushSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1),
  p256dh: z.string().trim().min(1),
  auth: z.string().trim().min(1),
});

export type SavePushSubscriptionInput = z.infer<typeof savePushSubscriptionSchema>;
