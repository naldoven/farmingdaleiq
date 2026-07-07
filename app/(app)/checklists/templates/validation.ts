import { z } from "zod";

import { HOLDING_MODES, QUESTION_TYPES, SCHEDULE_FREQUENCIES } from "@/app/(app)/checklists/logic";

/**
 * Input validation for the template-builder server actions
 * (app/(app)/checklists/templates/actions.ts): templates, sections,
 * questions, schedules, and food items. Kept in a plain module (no "use
 * server") so it's unit-testable on its own.
 */

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().uuid().optional());

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type TemplateInput = z.infer<typeof templateSchema>;

export const updateTemplateSchema = templateSchema.extend({
  id: z.string().uuid(),
  active: z.boolean(),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const sectionSchema = z.object({
  templateId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required"),
  sort: z.number().int().min(0).default(0),
});
export type SectionInput = z.infer<typeof sectionSchema>;

export const questionSchema = z
  .object({
    sectionId: z.string().uuid(),
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1, "Prompt is required"),
    allowNa: z.boolean().default(false),
    holdingMode: z.enum(HOLDING_MODES).default("cold"),
    foodItemId: optionalUuid,
    choicesText: z.string().trim().optional().or(z.literal("")),
    correctiveActions: z.string().trim().max(2000).optional().or(z.literal("")),
    photoRequired: z.boolean().default(false),
    tokenValue: z.number().int().min(0).default(0),
    sort: z.number().int().min(0).default(0),
  })
  .refine((data) => data.type !== "temperature" || Boolean(data.foodItemId), {
    message: "Temperature questions must reference a food item.",
    path: ["foodItemId"],
  })
  .refine(
    (data) => data.type !== "multi_choice" || Boolean(data.choicesText && data.choicesText.trim().length > 0),
    {
      message: "Multi-choice questions need at least one choice.",
      path: ["choicesText"],
    },
  );
export type QuestionInput = z.infer<typeof questionSchema>;

export const scheduleSchema = z
  .object({
    templateId: z.string().uuid(),
    frequency: z.enum(SCHEDULE_FREQUENCIES),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    dayPartId: optionalUuid,
    startTime: z.string().trim().optional().or(z.literal("")),
    dueTime: z.string().trim().optional().or(z.literal("")),
    assignPositionId: optionalUuid,
    assignTeamId: optionalUuid,
    alertOnIncomplete: z.boolean().default(false),
  })
  .refine((data) => data.frequency !== "weekly" || data.daysOfWeek.length > 0, {
    message: "Pick at least one day of the week.",
    path: ["daysOfWeek"],
  })
  .refine((data) => data.frequency !== "monthly" || data.dayOfMonth != null, {
    message: "Pick a day of the month.",
    path: ["dayOfMonth"],
  });
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export const foodItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  coldMinF: z.number().optional(),
  coldMaxF: z.number().optional(),
  hotMinF: z.number().optional(),
  hotMaxF: z.number().optional(),
});
export type FoodItemInput = z.infer<typeof foodItemSchema>;

export const idSchema = z.object({ id: z.string().uuid() });
