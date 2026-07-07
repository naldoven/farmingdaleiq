import { z } from "zod";

/**
 * Input validation for the run-side Checklists server actions
 * (app/(app)/checklists/actions.ts): starting a run, saving answers, and
 * completing a run. Kept in a plain module (no "use server") so it's
 * unit-testable on its own and importable from the client run-player form.
 */

export const answerInputSchema = z.object({
  questionId: z.string().uuid(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  isNa: z.boolean().default(false),
  manuallyFlagged: z.boolean().default(false),
  correctiveActionNote: z.string().trim().max(2000).optional().or(z.literal("")),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
  photoUrl: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type AnswerInputPayload = z.infer<typeof answerInputSchema>;

export const saveAnswersSchema = z.object({
  runId: z.string().uuid(),
  answers: z.array(answerInputSchema).min(1),
});

export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;

export const runIdSchema = z.object({
  runId: z.string().uuid(),
});

export const followUpIdSchema = z.object({
  followUpId: z.string().uuid(),
});
