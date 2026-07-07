import { z } from "zod";

/**
 * Input validation for the Teams server actions
 * (app/(app)/people/teams/actions.ts). Plain module (no "use server") so
 * it's unit-testable on its own.
 */

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Team name is required"),
});

export const renameTeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Team name is required"),
});

export const deleteTeamSchema = z.object({ id: z.string().uuid() });

export const addMemberSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const removeMemberSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
});
