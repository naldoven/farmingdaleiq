import { z } from "zod";

/**
 * Input validation for the /breaks server actions (app/(app)/breaks/actions.ts).
 * Plain module (no "use server") so it's unit-testable on its own.
 */

export const generateBreaksSchema = z.object({ setupId: z.string().uuid() });
export type GenerateBreaksInput = z.infer<typeof generateBreaksSchema>;

export const authorizeBreakSchema = z.object({ id: z.string().uuid() });
export type AuthorizeBreakInput = z.infer<typeof authorizeBreakSchema>;

export const startBreakSchema = z.object({ id: z.string().uuid() });
export type StartBreakInput = z.infer<typeof startBreakSchema>;

export const completeBreakSchema = z.object({ id: z.string().uuid() });
export type CompleteBreakInput = z.infer<typeof completeBreakSchema>;
