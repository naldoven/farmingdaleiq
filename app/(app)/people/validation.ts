import { z } from "zod";

import { isDiscordUserId } from "@/lib/discord/user-id";

/**
 * Input validation for the People server actions (app/(app)/people/actions.ts).
 * Kept in a plain module (no "use server") so it's unit-testable on its own
 * and importable from both the action file and its tests.
 */

export const updateProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  // Empty clears the id. Anything else must be the numeric id: a username here
  // makes Discord reject the whole webhook message (see lib/discord/user-id.ts).
  discordUserId: z
    .string()
    .trim()
    .refine((value) => value === "" || isDiscordUserId(value), {
      message: "Discord ID must be the 17 to 20 digit number from Discord, not a username.",
    })
    .optional(),
  birthdate: z.string().trim().optional().or(z.literal("")),
  hiredOn: z.string().trim().optional().or(z.literal("")),
  avatarUrl: z.string().trim().url("Enter a valid URL").max(2048).optional().or(z.literal("")),
  active: z.boolean(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Self-service edit path (KITCHENIQ-PARITY-AUDIT.md "People & Teams" [MED]:
 * "updateProfile unconditionally requires people.manage, so a user cannot
 * edit their own phone even though RLS/the guard permit personal fields").
 * Deliberately a narrower field set than updateProfileSchema: only the
 * columns `profile_privilege_guard` (supabase/migrations/20260707080200_
 * profile_discord_guard.sql) leaves genuinely self-editable — phone,
 * birthdate, avatar_url. role_id/active/store_id/discord_user_id/name/email
 * stay admin-only (people.manage), enforced both by the trigger and by
 * `updateOwnProfile` simply never accepting those fields as input.
 */
export const selfUpdateProfileSchema = z.object({
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  birthdate: z.string().trim().optional().or(z.literal("")),
  avatarUrl: z.string().trim().url("Enter a valid URL").max(2048).optional().or(z.literal("")),
});

export type SelfUpdateProfileInput = z.infer<typeof selfUpdateProfileSchema>;

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

/** "New setup link" on a profile. The email is looked up on the server. */
export const newSetupLinkSchema = z.object({
  profileId: z.string().uuid(),
});

export type NewSetupLinkInput = z.infer<typeof newSetupLinkSchema>;

/**
 * "Set temporary password" on a profile. 8 matches the set-password form; 72
 * is the longest password Supabase (bcrypt) accepts. Not trimmed: a password
 * is taken exactly as typed.
 */
export const temporaryPasswordSchema = z.object({
  profileId: z.string().uuid(),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Use 72 characters or fewer."),
});

export type TemporaryPasswordInput = z.infer<typeof temporaryPasswordSchema>;
