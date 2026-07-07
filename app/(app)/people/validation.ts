import { z } from "zod";

/**
 * Input validation for the People server actions (app/(app)/people/actions.ts).
 * Kept in a plain module (no "use server") so it's unit-testable on its own
 * and importable from both the action file and its tests.
 */

export const updateProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  discordUserId: z.string().trim().max(50).optional().or(z.literal("")),
  birthdate: z.string().trim().optional().or(z.literal("")),
  hiredOn: z.string().trim().optional().or(z.literal("")),
  active: z.boolean(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const assignRoleSchema = z.object({
  id: z.string().uuid(),
  roleId: z.string().uuid().nullable(),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const inviteUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  roleId: z.string().uuid().nullable(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
