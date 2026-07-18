import { z } from "zod";

/**
 * Input validation for the Tasks server actions (app/(app)/tasks/actions.ts).
 * Kept in a plain module (no "use server") so it's unit-testable on its own
 * and importable from both the action file and its tests, matching the
 * People/Teams reference pattern (app/(app)/people/validation.ts).
 *
 * ARCHITECTURE.md "Tasks (To-Dos)" + "Data model (Postgres)" > Tasks:
 * task_templates(title, description, frequency, days_of_week, day_part_id,
 * start_time, due_time, assign_position_id, assign_user_id, token_value,
 * active); tasks(template_id?, kind, title, description, date, day_part_id,
 * start_time, due_at, assigned_user_id, assigned_position_id, setup_id,
 * status, completed_by, completed_at, token_value, created_by, ref).
 */

const uuidOrEmpty = z.string().trim().uuid().optional().or(z.literal(""));
const timeString = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM")
  .optional()
  .or(z.literal(""));

// A due timestamp coming off a UI field: either empty (no due time) or a value
// `new Date()` can parse. Guards against a malformed string reaching the
// `tasks.due_at` insert and silently landing as null / a bad timestamp.
const dueAtString = z
  .string()
  .trim()
  .refine((v) => v === "" || !Number.isNaN(new Date(v).getTime()), "Use a valid date/time")
  .optional()
  .or(z.literal(""));

function normalizeUuid(value: string | undefined): string | null {
  return value ? value : null;
}

function normalizeTime(value: string | undefined): string | null {
  return value ? value : null;
}

// An ad hoc (one-off) task assigned directly to a person or a position, or
// left unassigned to sit in the shift pool for manual delegation.
export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    date: z.string().trim().min(1, "Date is required"),
    dayPartId: uuidOrEmpty,
    startTime: timeString,
    dueAt: dueAtString,
    assignedUserId: uuidOrEmpty,
    assignedPositionId: uuidOrEmpty,
    tokenValue: z.number().int().min(0).max(10_000).default(0),
    notifyDiscord: z.boolean().default(false),
    discordChannelId: uuidOrEmpty,
    // T2: client-generated idempotency key (crypto.randomUUID) minted per submit
    // attempt. Threaded to tasks.request_id (unique partial index) so a
    // retry/double-submit is a no-op that returns the first task. Optional so
    // existing callers/tests that omit it keep the current behavior.
    requestId: uuidOrEmpty,
  })
  .transform((v) => ({
    title: v.title,
    description: v.description ? v.description : null,
    date: v.date,
    dayPartId: normalizeUuid(v.dayPartId),
    startTime: normalizeTime(v.startTime),
    dueAt: v.dueAt ? v.dueAt : null,
    assignedUserId: normalizeUuid(v.assignedUserId),
    assignedPositionId: normalizeUuid(v.assignedPositionId),
    tokenValue: v.tokenValue,
    notifyDiscord: v.notifyDiscord,
    discordChannelId: normalizeUuid(v.discordChannelId),
    requestId: normalizeUuid(v.requestId),
  }));

export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const taskFrequencySchema = z.enum(["daily", "weekly"]);

const taskTemplateFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  frequency: taskFrequencySchema,
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dayPartId: uuidOrEmpty,
  startTime: timeString,
  dueTime: timeString,
  assignPositionId: uuidOrEmpty,
  assignUserId: uuidOrEmpty,
  tokenValue: z.number().int().min(0).max(10_000).default(0),
};

function requireWeeklyDays(
  v: { frequency: "daily" | "weekly"; daysOfWeek?: number[] },
  ctx: z.RefinementCtx,
) {
  if (v.frequency === "weekly" && (!v.daysOfWeek || v.daysOfWeek.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pick at least one day of the week for a weekly task",
      path: ["daysOfWeek"],
    });
  }
}

function normalizeTemplateFields(v: {
  title: string;
  description?: string;
  frequency: "daily" | "weekly";
  daysOfWeek?: number[];
  dayPartId?: string;
  startTime?: string;
  dueTime?: string;
  assignPositionId?: string;
  assignUserId?: string;
  tokenValue: number;
}) {
  return {
    title: v.title,
    description: v.description ? v.description : null,
    frequency: v.frequency,
    daysOfWeek: v.frequency === "weekly" ? (v.daysOfWeek ?? []) : null,
    dayPartId: normalizeUuid(v.dayPartId),
    startTime: normalizeTime(v.startTime),
    dueTime: normalizeTime(v.dueTime),
    assignPositionId: normalizeUuid(v.assignPositionId),
    assignUserId: normalizeUuid(v.assignUserId),
    tokenValue: v.tokenValue,
  };
}

export const createTaskTemplateSchema = z
  .object(taskTemplateFields)
  .superRefine(requireWeeklyDays)
  .transform(normalizeTemplateFields);

export type CreateTaskTemplateInput = z.input<typeof createTaskTemplateSchema>;

// Editing an existing recurring template: same fields plus the target id.
export const updateTaskTemplateSchema = z
  .object({ id: z.string().uuid(), ...taskTemplateFields })
  .superRefine(requireWeeklyDays)
  .transform((v) => ({ id: v.id, ...normalizeTemplateFields(v) }));

export type UpdateTaskTemplateInput = z.input<typeof updateTaskTemplateSchema>;

export const setTaskTemplateActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

export type SetTaskTemplateActiveInput = z.infer<typeof setTaskTemplateActiveSchema>;

export const completeTaskSchema = z.object({
  id: z.string().uuid(),
});

export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;

export const claimTaskSchema = z.object({
  id: z.string().uuid(),
});

export type ClaimTaskInput = z.infer<typeof claimTaskSchema>;

// Leader delegation: assign a task to a person or a position, or (with
// `toPool: true`) hand it back to the shift pool by clearing both assignees.
// Outside a pool return, exactly one of userId/positionId must be set.
export const delegateTaskSchema = z
  .object({
    id: z.string().uuid(),
    assignedUserId: uuidOrEmpty,
    assignedPositionId: uuidOrEmpty,
    toPool: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.toPool) {
      if (v.assignedUserId || v.assignedPositionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Returning to the pool can't also set an assignee",
          path: ["assignedUserId"],
        });
      }
      return;
    }
    const hasUser = Boolean(v.assignedUserId);
    const hasPosition = Boolean(v.assignedPositionId);
    if (hasUser === hasPosition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assign to exactly one person or position",
        path: ["assignedUserId"],
      });
    }
  })
  .transform((v) => ({
    id: v.id,
    assignedUserId: normalizeUuid(v.assignedUserId),
    assignedPositionId: normalizeUuid(v.assignedPositionId),
  }));

export type DelegateTaskInput = z.input<typeof delegateTaskSchema>;

export const cancelTaskSchema = z.object({
  id: z.string().uuid(),
});

export type CancelTaskInput = z.infer<typeof cancelTaskSchema>;
