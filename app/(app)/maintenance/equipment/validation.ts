import { z } from "zod";

/**
 * Input validation for the Equipment registry + PM schedule server actions
 * (app/(app)/maintenance/equipment/actions.ts).
 */

const uuid = z.string().uuid();
const optionalUuid = z.string().uuid().optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const optionalText = z.string().trim().optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const optionalDate = z.string().trim().optional().or(z.literal("")).transform((v) => (v ? v : undefined));

export const equipmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: optionalText,
  area: optionalText,
  model: optionalText,
  serial: optionalText,
  serviceVendorId: optionalUuid,
  installedOn: optionalDate,
  warrantyExpiresOn: optionalDate,
  photoUrl: optionalText,
  notes: optionalText,
});
export type EquipmentInput = z.infer<typeof equipmentSchema>;

export const updateEquipmentSchema = equipmentSchema.extend({ id: uuid });
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;

export const setEquipmentStatusSchema = z.object({
  equipmentId: uuid,
  status: z.enum(["operational", "down"]),
  workOrderId: optionalUuid,
});
export type SetEquipmentStatusInput = z.infer<typeof setEquipmentStatusSchema>;

export const addEquipmentFileSchema = z.object({
  equipmentId: uuid,
  fileUrl: z.string().trim().min(1, "A file URL is required").max(2000),
  label: optionalText,
});
export type AddEquipmentFileInput = z.infer<typeof addEquipmentFileSchema>;

export const pmScheduleSchema = z.object({
  equipmentId: uuid,
  title: z.string().trim().min(1, "Title is required"),
  description: optionalText,
  intervalDays: z.coerce.number().int().positive("Interval must be a positive number of days"),
  leadDays: z.coerce.number().int().min(0).default(0),
  nextDueOn: optionalDate,
  checklistTemplateId: optionalUuid,
  assignUserId: optionalUuid,
  vendorId: optionalUuid,
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  active: z.boolean().default(true),
});
export type PmScheduleInput = z.infer<typeof pmScheduleSchema>;

export const updatePmScheduleSchema = pmScheduleSchema.extend({ id: uuid });
export type UpdatePmScheduleInput = z.infer<typeof updatePmScheduleSchema>;

export const setPmScheduleActiveSchema = z.object({
  id: uuid,
  active: z.boolean(),
});
export type SetPmScheduleActiveInput = z.infer<typeof setPmScheduleActiveSchema>;
