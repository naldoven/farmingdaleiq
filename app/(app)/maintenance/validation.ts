import { z } from "zod";

/**
 * Input validation for the Maintenance server actions
 * (app/(app)/maintenance/actions.ts). Kept in a plain module (no "use
 * server") so it's unit-testable on its own and importable from both the
 * action file and its tests.
 */

const uuid = z.string().uuid();
const optionalUuid = z.string().uuid().optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const optionalText = z.string().trim().optional().or(z.literal("")).transform((v) => (v ? v : undefined));
// Photo/invoice fields are plain URL-shaped text, not strictly validated as
// URLs: there is no file-upload flow yet (matches the Checklists precedent
// in app/(app)/checklists/validation.ts's photoUrl field), so this just caps
// length and drops blanks to undefined.
const optionalUrl = z.string().trim().max(2000).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

export const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

export const submitMaintenanceRequestSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: optionalText,
  equipmentId: optionalUuid,
  area: optionalText,
  suggestedPriority: priorityEnum.optional(),
  photoUrls: z.array(z.string().trim().max(2000)).optional().default([]),
});
export type SubmitMaintenanceRequestInput = z.infer<typeof submitMaintenanceRequestSchema>;

export const approveRequestSchema = z.object({
  requestId: uuid,
  priority: priorityEnum,
  assignedUserId: optionalUuid,
  vendorId: optionalUuid,
  scheduledFor: optionalText,
  dueAt: optionalText,
});
export type ApproveRequestInput = z.infer<typeof approveRequestSchema>;

export const declineRequestSchema = z.object({
  requestId: uuid,
  declinedReason: z.string().trim().min(1, "A reason is required"),
});
export type DeclineRequestInput = z.infer<typeof declineRequestSchema>;

export const createWorkOrderSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: optionalText,
  equipmentId: optionalUuid,
  priority: priorityEnum,
  assignedUserId: optionalUuid,
  vendorId: optionalUuid,
  scheduledFor: optionalText,
  dueAt: optionalText,
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const updateWorkOrderStatusSchema = z.object({
  workOrderId: uuid,
  status: z.enum(["open", "in_progress", "on_hold", "complete", "cancelled"]),
});
export type UpdateWorkOrderStatusInput = z.infer<typeof updateWorkOrderStatusSchema>;

export const assignWorkOrderSchema = z.object({
  workOrderId: uuid,
  assignedUserId: optionalUuid,
  vendorId: optionalUuid,
  scheduledFor: optionalText,
  dueAt: optionalText,
  priority: priorityEnum.optional(),
  // Per-instance Discord opt-in (ARCHITECTURE.md "Discord integration" >
  // "The flag"). Deliberately plain `.optional()` (not the `optionalUuid`
  // helper above): that helper's transform makes the key REQUIRED-but-
  // possibly-undefined in the inferred input type (existing callers already
  // pass e.g. `scheduledFor: undefined` explicitly for that reason), which
  // would force every existing assignWorkOrder call site to be touched just
  // to add these two fields. A plain `.optional()` keeps the key itself
  // optional, so call sites that don't know about Discord yet don't need to
  // change. Omitting a key leaves the stored value untouched; see
  // discordFlagPayload in logic.ts for why only "on" is ever forwarded into
  // an emitted event.
  notifyDiscord: z.boolean().optional(),
  discordChannelId: z.string().uuid().optional(),
});
export type AssignWorkOrderInput = z.infer<typeof assignWorkOrderSchema>;

export const completeWorkOrderSchema = z.object({
  workOrderId: uuid,
  cost: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), {
      message: "Cost must be a non-negative number",
    }),
  invoiceUrl: optionalUrl,
  markEquipmentUp: z.boolean().optional().default(false),
});
// z.input (not z.infer/z.output): `cost` accepts a number OR a numeric
// string from a plain <input> before the schema's .transform() coerces it,
// so the server action's declared parameter type matches what a form
// actually passes (see components/maintenance/work-order-detail.tsx).
export type CompleteWorkOrderInput = z.input<typeof completeWorkOrderSchema>;

export const addWorkOrderCommentSchema = z
  .object({
    workOrderId: uuid,
    body: optionalText,
    photoUrl: optionalUrl,
  })
  .refine((v) => Boolean(v.body) || Boolean(v.photoUrl), {
    message: "Add a comment or a photo",
  });
export type AddWorkOrderCommentInput = z.infer<typeof addWorkOrderCommentSchema>;
