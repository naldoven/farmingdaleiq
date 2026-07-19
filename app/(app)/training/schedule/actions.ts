"use server";

/**
 * Trainee week schedule server actions (ARCHITECTURE.md "Trainee lifecycle"
 * > "Trainee schedule"). Follows the People/Teams permission-guard pattern.
 */

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/bus";
import type { ActionResult } from "@/app/(app)/training/action-types";
import {
  createSessionSchema,
  deleteSessionSchema,
  type CreateSessionInput,
  type DeleteSessionInput,
} from "@/app/(app)/training/schedule/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

async function emitBestEffort(key: Parameters<typeof emitEvent>[0], payload: Record<string, unknown>) {
  try {
    await emitEvent(key, payload);
  } catch (error) {
    console.error(`training schedule: emitEvent(${key}) failed`, error);
  }
}

export async function createSession(input: CreateSessionInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.manage");
    // safeParse (not parse) so a validation failure -- notably the TR8
    // end-after-start rule -- returns the friendly issue message instead of a
    // raw ZodError JSON blob surfaced through toActionError.
    const parsedResult = createSessionSchema.safeParse(input);
    if (!parsedResult.success) {
      return { ok: false, error: parsedResult.error.issues[0]?.message ?? "Invalid session details." };
    }
    const parsed = parsedResult.data;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("training_sessions")
      .insert({
        enrollment_id: parsed.enrollmentId,
        date: parsed.date,
        position_id: parsed.positionId ?? null,
        start_time: parsed.startTime ? parsed.startTime : null,
        end_time: parsed.endTime ? parsed.endTime : null,
        trainer_user_id: parsed.trainerUserId ?? null,
        tags: parsed.tags.length > 0 ? parsed.tags : undefined,
        note: parsed.note ? parsed.note : null,
      })
      .select("id, enrollment_id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the session." };
    }

    const { data: enrollment } = await supabase
      .from("trainee_enrollments")
      .select("user_id")
      .eq("id", data.enrollment_id)
      .maybeSingle();

    await emitBestEffort("training_assigned", {
      sessionId: data.id,
      enrollmentId: data.enrollment_id,
      userId: enrollment?.user_id ?? null,
    });

    revalidatePath("/training/schedule");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteSession(input: DeleteSessionInput): Promise<ActionResult> {
  try {
    await requirePermission("training.manage");
    const parsed = deleteSessionSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("training_sessions").delete().eq("id", parsed.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/training/schedule");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
