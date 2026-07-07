import { z } from "zod";

/**
 * Input validation for the Team Feed server actions
 * (app/(app)/team/actions.ts). Kept in a plain module (no "use server") so
 * it's unit-testable on its own and importable from both the action file
 * and its tests.
 */

export const createRecognitionSchema = z.object({
  subjectUserId: z.string().uuid(),
  amount: z.coerce.number().int("Enter a whole number").positive("Enter a positive amount").max(1000),
  body: z.string().trim().min(1, "Say what they did well"),
});

export type CreateRecognitionInput = z.infer<typeof createRecognitionSchema>;

export const createBroadcastSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(2000),
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;

export const postIdSchema = z.object({
  postId: z.string().uuid(),
});

export type PostIdInput = z.infer<typeof postIdSchema>;

export const addCommentSchema = z.object({
  postId: z.string().uuid(),
  body: z.string().trim().min(1, "Comment can't be empty").max(500),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;
