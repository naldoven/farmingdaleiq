"use server";

/**
 * Graduation + 30-day audit server actions (ARCHITECTURE.md "Trainee
 * lifecycle" > "Graduation"). Follows the People/Teams permission-guard
 * pattern.
 *
 * Idempotency: recordAudit only writes when the audit's result is still
 * null (conditional update), so a double-submitted PASS/PIP click can't
 * flip the trainee's status twice or overwrite a prior leader's call.
 */

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/training/action-types";
import { enrollmentStatusAfterAudit } from "@/app/(app)/training/graduates/logic";
import { recordAuditSchema, type RecordAuditInput } from "@/app/(app)/training/graduates/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

export async function recordAudit(input: RecordAuditInput): Promise<ActionResult> {
  try {
    await requirePermission("training.manage");
    const parsed = recordAuditSchema.parse(input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    const { data: audit } = await supabase
      .from("graduation_audits")
      .select("id, enrollment_id, result")
      .eq("id", parsed.auditId)
      .maybeSingle();

    if (!audit) {
      return { ok: false, error: "Audit not found." };
    }
    if (audit.result) {
      return { ok: true, data: undefined }; // already recorded; safe no-op
    }

    const { data: updatedRows, error: auditError } = await supabase
      .from("graduation_audits")
      .update({
        result: parsed.result,
        notes: parsed.notes ? parsed.notes : null,
        recorded_by: userData.user?.id ?? null,
        recorded_at: new Date().toISOString(),
      })
      .eq("id", parsed.auditId)
      .is("result", null)
      .select("id");

    if (auditError) {
      return { ok: false, error: auditError.message };
    }
    if (!updatedRows || updatedRows.length === 0) {
      return { ok: true, data: undefined }; // raced with another recorder
    }

    const nextStatus = enrollmentStatusAfterAudit(parsed.result);
    await supabase.from("trainee_enrollments").update({ status: nextStatus }).eq("id", audit.enrollment_id);

    revalidatePath("/training/graduates");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
