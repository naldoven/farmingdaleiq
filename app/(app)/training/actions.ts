"use server";

/**
 * Training / Development Passports server actions
 * (ARCHITECTURE.md "Training — Development Passports"). Follows the
 * People/Teams permission-guard pattern:
 *   1. requirePermission(<key>) (or an ownership check for self-service
 *      item progress -- see upsertItemProgress) before any DB call.
 *   2. Writes go through the per-request client; RLS
 *      (supabase/migrations/20260707020000_training_rls.sql) is the
 *      independent backstop for the same rule.
 *   3. Actions return a discriminated ActionResult.
 *   4. Mutations revalidate "/training".
 *
 * Idempotency: enrollPassport checks for an existing enrollment first
 * (unique-ish by passport_id+user_id in practice) rather than blindly
 * inserting a duplicate; stampPassport re-checks stamped_at is still null
 * before writing, so a double-submitted stamp click is a safe no-op instead
 * of double-upgrading a role or double-filling an org slot.
 */

import { revalidatePath } from "next/cache";

import { PermissionError, hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/bus";
import type { ActionResult } from "@/app/(app)/training/action-types";
import {
  allItemsComplete,
  canStampLeadership,
  canStampPosition,
  isItemProgressComplete,
  pickVacantSlot,
} from "@/app/(app)/training/stamp-logic";
import {
  createCourseAttachmentSchema,
  createCourseSchema,
  createPassportItemSchema,
  deleteCourseAttachmentSchema,
  deletePassportItemSchema,
  enrollPassportSchema,
  signItemSchema,
  stampPassportSchema,
  submitCourseFeedbackSchema,
  upsertItemProgressSchema,
  type CreateCourseAttachmentInput,
  type CreateCourseInput,
  type CreatePassportItemInput,
  type DeleteCourseAttachmentInput,
  type DeletePassportItemInput,
  type EnrollPassportInput,
  type SignItemInput,
  type StampPassportInput,
  type SubmitCourseFeedbackInput,
  type UpsertItemProgressInput,
} from "@/app/(app)/training/validation";

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
    console.error(`training actions: emitEvent(${key}) failed`, error);
  }
}

export async function createPassportItem(input: CreatePassportItemInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.manage");
    const parsed = createPassportItemSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("passport_items")
      .insert({
        passport_id: parsed.passportId,
        type: parsed.type,
        label: parsed.label,
        sort: parsed.sort,
        course_id: parsed.courseId ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the item." };
    }

    revalidatePath("/training");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deletePassportItem(input: DeletePassportItemInput): Promise<ActionResult> {
  try {
    await requirePermission("training.manage");
    const parsed = deletePassportItemSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("passport_items").delete().eq("id", parsed.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/training");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Enrolls a person on a passport (position or leadership/pipeline). Safe to
 * call twice: returns the existing enrollment instead of creating a
 * duplicate. */
export async function enrollPassport(input: EnrollPassportInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.manage");
    const parsed = enrollPassportSchema.parse(input);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("passport_enrollments")
      .select("id")
      .eq("passport_id", parsed.passportId)
      .eq("user_id", parsed.userId)
      .maybeSingle();

    if (existing) {
      return { ok: true, data: { id: existing.id } };
    }

    const { data, error } = await supabase
      .from("passport_enrollments")
      .insert({
        passport_id: parsed.passportId,
        user_id: parsed.userId,
        track: parsed.track ? parsed.track : null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not enroll." };
    }

    revalidatePath("/training");
    revalidatePath("/training/pipelines");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Self-reported progress (check/slider/photo) OR a trainer/manager
 * correcting it. Ownership check (current user === enrollment.user_id)
 * stands in for a permission key on the self-service path, mirroring RLS.
 *
 * completed_at only gets set when the written value is real completion for
 * the item's type (see isItemProgressComplete): unchecking a checkbox, or
 * writing a partial slider value, clears completed_at instead of leaving --
 * or instantly stamping -- a false "done" so stamp-readiness can't be
 * reached prematurely. */
export async function upsertItemProgress(input: UpsertItemProgressInput): Promise<ActionResult> {
  try {
    const parsed = upsertItemProgressSchema.parse(input);
    const supabase = await createClient();

    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id ?? null;

    const { data: enrollment } = await supabase
      .from("passport_enrollments")
      .select("id, user_id")
      .eq("id", parsed.enrollmentId)
      .maybeSingle();

    if (!enrollment) {
      return { ok: false, error: "Enrollment not found." };
    }

    const isOwner = currentUserId !== null && enrollment.user_id === currentUserId;
    if (!isOwner) {
      const allowed = (await hasPermission("training.manage")) || (await hasPermission("training.stamp"));
      if (!allowed) {
        return { ok: false, error: "You don't have permission to do this." };
      }
    }

    const { data: item } = await supabase
      .from("passport_items")
      .select("type")
      .eq("id", parsed.itemId)
      .maybeSingle();

    const value: Record<string, unknown> = {};
    if (parsed.checked !== undefined) value.checked = parsed.checked;
    if (parsed.sliderValue !== undefined) value.sliderValue = parsed.sliderValue;

    const { data: existing } = await supabase
      .from("passport_item_progress")
      .select("id")
      .eq("enrollment_id", parsed.enrollmentId)
      .eq("item_id", parsed.itemId)
      .maybeSingle();

    const complete = isItemProgressComplete(item?.type ?? null, {
      checked: parsed.checked,
      sliderValue: parsed.sliderValue,
      photoUrl: parsed.photoUrl,
    });

    const row = {
      enrollment_id: parsed.enrollmentId,
      item_id: parsed.itemId,
      value: value as never,
      photo_url: parsed.photoUrl ? parsed.photoUrl : null,
      completed_at: complete ? new Date().toISOString() : null,
    };

    const { error } = existing
      ? await supabase.from("passport_item_progress").update(row).eq("id", existing.id)
      : await supabase.from("passport_item_progress").insert(row);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/training");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Trainer countersign for a signature-type passport item. */
export async function signItem(input: SignItemInput): Promise<ActionResult> {
  try {
    await requirePermission("training.stamp");
    const parsed = signItemSchema.parse(input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    // TR2 fix: a person may never countersign their own passport item
    // (self-approval). The UI hides self-sign, but a direct action call must
    // be rejected server-side regardless of the caller's training.stamp grant.
    const { data: signEnrollment } = await supabase
      .from("passport_enrollments")
      .select("user_id")
      .eq("id", parsed.enrollmentId)
      .maybeSingle();
    if (!signEnrollment) {
      return { ok: false, error: "Enrollment not found." };
    }
    if (userData.user?.id && signEnrollment.user_id === userData.user.id) {
      return { ok: false, error: "You can't sign off on your own passport." };
    }

    const { data: existing } = await supabase
      .from("passport_item_progress")
      .select("id")
      .eq("enrollment_id", parsed.enrollmentId)
      .eq("item_id", parsed.itemId)
      .maybeSingle();

    const row = {
      enrollment_id: parsed.enrollmentId,
      item_id: parsed.itemId,
      signed_by: userData.user?.id ?? null,
      completed_at: new Date().toISOString(),
    };

    const { error } = existing
      ? await supabase.from("passport_item_progress").update(row).eq("id", existing.id)
      : await supabase.from("passport_item_progress").insert(row);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/training");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Stamps a passport: verifies the completion gate (position: all items done
 * + >= 3 stars on the linked position; leadership: all items done), records
 * stamped_by/stamped_at, emits passport_stamped, and -- for a leadership
 * passport -- upgrades the person's role and auto-fills a vacant org slot in
 * the passport's mapped tier.
 *
 * Idempotent: re-checks stamped_at is still null via a conditional update;
 * if another request already stamped it, this becomes a no-op success
 * rather than re-running the role upgrade / slot fill a second time.
 */
export async function stampPassport(input: StampPassportInput): Promise<ActionResult> {
  try {
    await requirePermission("training.stamp");
    const parsed = stampPassportSchema.parse(input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    const { data: enrollment } = await supabase
      .from("passport_enrollments")
      .select("id, user_id, passport_id, stamped_at")
      .eq("id", parsed.enrollmentId)
      .maybeSingle();

    if (!enrollment) {
      return { ok: false, error: "Enrollment not found." };
    }
    // TR2 fix: a person may never stamp their own passport (self-approval).
    // For a leadership passport this would self-upgrade the actor's role and
    // fill an org slot, so it must be blocked server-side even for a
    // training.stamp holder, regardless of what the UI shows.
    if (userData.user?.id && enrollment.user_id === userData.user.id) {
      return { ok: false, error: "You can't stamp your own passport." };
    }
    if (enrollment.stamped_at) {
      return { ok: true, data: undefined }; // already stamped; safe no-op
    }

    const { data: passport } = await supabase
      .from("passports")
      .select("id, kind, position_id, target_role_id, org_tier_id, name")
      .eq("id", enrollment.passport_id)
      .maybeSingle();

    if (!passport) {
      return { ok: false, error: "Passport not found." };
    }

    const [{ data: items }, { data: progress }] = await Promise.all([
      supabase.from("passport_items").select("id").eq("passport_id", passport.id),
      supabase
        .from("passport_item_progress")
        .select("item_id, completed_at")
        .eq("enrollment_id", enrollment.id),
    ]);

    const complete = allItemsComplete(items ?? [], progress ?? []);

    if (passport.kind === "position") {
      const { data: rating } = await supabase
        .from("position_ratings")
        .select("stars")
        .eq("user_id", enrollment.user_id)
        .eq("position_id", passport.position_id ?? "")
        .eq("is_current", true)
        .maybeSingle();

      if (!canStampPosition(complete, rating?.stars ?? null)) {
        return {
          ok: false,
          error: "Not ready to stamp: every item must be complete and the person needs a 3.0+ rating on this position.",
        };
      }
    } else if (!canStampLeadership(complete)) {
      return { ok: false, error: "Not ready to stamp: every stage must be complete first." };
    }

    // Conditional update: only stamps if it's still unstamped, so a race
    // between two leaders clicking "Stamp" can't run the role-upgrade /
    // slot-fill side effects twice.
    const { data: stampedRows, error: stampError } = await supabase
      .from("passport_enrollments")
      .update({ stamped_by: userData.user?.id ?? null, stamped_at: new Date().toISOString() })
      .eq("id", enrollment.id)
      .is("stamped_at", null)
      .select("id");

    if (stampError) {
      return { ok: false, error: stampError.message };
    }
    if (!stampedRows || stampedRows.length === 0) {
      return { ok: true, data: undefined }; // someone else stamped it first
    }

    await emitBestEffort("passport_stamped", {
      enrollmentId: enrollment.id,
      passportId: passport.id,
      userId: enrollment.user_id,
      kind: passport.kind,
    });

    if (passport.kind === "leadership" && passport.target_role_id) {
      await supabase.from("profiles").update({ role_id: passport.target_role_id }).eq("id", enrollment.user_id);
    }

    if (passport.kind === "leadership" && passport.org_tier_id) {
      const { data: slots } = await supabase
        .from("org_slots")
        .select("id, user_id, sort")
        .eq("tier_id", passport.org_tier_id);
      const vacant = pickVacantSlot(slots ?? []);
      if (vacant) {
        await supabase.from("org_slots").update({ user_id: enrollment.user_id }).eq("id", vacant.id).is("user_id", null);
      }
    }

    revalidatePath("/training");
    revalidatePath("/training/pipelines");
    revalidatePath("/people/org-chart");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function createCourse(input: CreateCourseInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.manage");
    const parsed = createCourseSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("training_courses")
      .insert({
        name: parsed.name,
        description: parsed.description ? parsed.description : null,
        content: parsed.content ? parsed.content : null,
        vendor_id: parsed.vendorId ?? null,
        sort: parsed.sort,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the course." };
    }

    revalidatePath("/training");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Attaches a manual/reference file to a course (ARCHITECTURE.md training
 * courses: vendor-tied training material). Manager-only, matching the
 * course_attachments RLS write policy. */
export async function createCourseAttachment(
  input: CreateCourseAttachmentInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.manage");
    const parsed = createCourseAttachmentSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("course_attachments")
      .insert({
        course_id: parsed.courseId,
        file_url: parsed.fileUrl,
        label: parsed.label ? parsed.label : null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not add the attachment." };
    }

    revalidatePath("/training");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteCourseAttachment(input: DeleteCourseAttachmentInput): Promise<ActionResult> {
  try {
    await requirePermission("training.manage");
    const parsed = deleteCourseAttachmentSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("course_attachments").delete().eq("id", parsed.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/training");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function submitCourseFeedback(input: SubmitCourseFeedbackInput): Promise<ActionResult> {
  try {
    const parsed = submitCourseFeedbackSchema.parse(input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return { ok: false, error: "Sign in required." };
    }

    const { error } = await supabase.from("course_feedback").insert({
      course_id: parsed.courseId,
      user_id: userData.user.id,
      rating: parsed.rating,
      feedback: parsed.feedback ? parsed.feedback : null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/training");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
