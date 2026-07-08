import { z } from "zod";

// Re-exported so server/action code can keep importing it from here; the client
// form imports it directly from ./constants to stay zod-free.
export { SESSION_TAG_OPTIONS } from "./constants";

export const createSessionSchema = z.object({
  enrollmentId: z.string().uuid(),
  date: z.string().min(1, "Date is required"),
  positionId: z.string().uuid().nullable().optional(),
  startTime: z.string().trim().optional().or(z.literal("")),
  endTime: z.string().trim().optional().or(z.literal("")),
  trainerUserId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).default([]),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const deleteSessionSchema = z.object({ id: z.string().uuid() });
export type DeleteSessionInput = z.infer<typeof deleteSessionSchema>;
