import { z } from "zod";

export const recordAuditSchema = z.object({
  auditId: z.string().uuid(),
  result: z.enum(["pass", "pip"]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type RecordAuditInput = z.infer<typeof recordAuditSchema>;
