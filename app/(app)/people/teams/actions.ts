"use server";

/**
 * Teams CRUD server actions. Follows the same permission-guard pattern
 * documented in app/(app)/people/actions.ts: requirePermission() first,
 * then a write through the per-request Supabase client so RLS
 * (teams_write_manager / team_members_write_manager in
 * supabase/migrations/20260707001850_people_teams_rls.sql) independently
 * enforces the same rule.
 */

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/people/action-types";
import {
  addMemberSchema,
  createTeamSchema,
  deleteTeamSchema,
  removeMemberSchema,
  renameTeamSchema,
} from "@/app/(app)/people/teams/validation";

export async function createTeam(
  input: z.infer<typeof createTeamSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("teams.manage");
    const parsed = createTeamSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("teams")
      .insert({ name: parsed.name })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create team." };
    }

    revalidatePath("/people/teams");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function renameTeam(
  input: z.infer<typeof renameTeamSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("teams.manage");
    const parsed = renameTeamSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("teams")
      .update({ name: parsed.name })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/people/teams");
    revalidatePath(`/people/teams/${parsed.id}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteTeam(
  input: z.infer<typeof deleteTeamSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("teams.manage");
    const parsed = deleteTeamSchema.parse(input);
    const supabase = await createClient();

    // team_members rows cascade-delete with the team (core.sql: `on delete
    // cascade` on team_members.team_id).
    const { error } = await supabase.from("teams").delete().eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/people/teams");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function addTeamMember(
  input: z.infer<typeof addMemberSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("teams.manage");
    const parsed = addMemberSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("team_members")
      .insert({ team_id: parsed.teamId, user_id: parsed.userId });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(`/people/teams/${parsed.teamId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function removeTeamMember(
  input: z.infer<typeof removeMemberSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("teams.manage");
    const parsed = removeMemberSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", parsed.teamId)
      .eq("user_id", parsed.userId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(`/people/teams/${parsed.teamId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
