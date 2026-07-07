"use server";

/**
 * Ratings server actions. Follows the People/Teams permission-guard pattern
 * (app/(app)/people/actions.ts):
 *   1. requirePermission(<key>) first.
 *   2. Writes go through the per-request client so RLS
 *      (supabase/migrations/20260707020000_training_rls.sql) independently
 *      re-checks the same rule.
 *   3. Actions return a discriminated ActionResult.
 *   4. Mutations call revalidatePath("/ratings").
 *
 * Idempotency (PLAN.md hard boundary): rating a person on a position always
 * does "flip old is_current rows to false, then insert the new current row".
 * A DB-level partial unique index (position_ratings_one_current_per_user_position,
 * in the same RLS migration) makes a racing double-submit fail the second
 * insert with a unique violation (Postgres code 23505) instead of leaving two
 * "current" rows; that violation is caught below and treated as a success
 * (the rating was already recorded), so a double-submitted rate is safe to
 * run twice.
 */

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/ratings/action-types";
import {
  quickRateSchema,
  rubricRateSchema,
  resolveRerateSchema,
  upsertRubricSchema,
  type QuickRateInput,
  type RubricRateInput,
  type ResolveRerateInput,
  type UpsertRubricInput,
} from "@/app/(app)/ratings/validation";
import { averageCategoryScores } from "@/app/(app)/ratings/logic";

const UNIQUE_VIOLATION = "23505";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

/** Marks any prior is_current rating for (userId, positionId) as not
 * current, then inserts the new one. Catches a racing unique-violation on
 * the insert (see file header) and resolves it by reading back whatever row
 * is now current, rather than surfacing a confusing error to a double-tap.
 *
 * Exported so the Station Grid action (app/(app)/training/grid/actions.ts,
 * same S4 stream) can reuse it: "A score writes a quick position rating ...
 * for that station" (ARCHITECTURE.md "Trainee lifecycle" > "Station grid"). */
export async function replaceCurrentRating(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    userId: string;
    positionId: string;
    stars: number;
    categoryScores: unknown;
    comment: string | null;
    ratedBy: string | null;
  },
): Promise<ActionResult> {
  const { error: clearError } = await supabase
    .from("position_ratings")
    .update({ is_current: false })
    .eq("user_id", params.userId)
    .eq("position_id", params.positionId)
    .eq("is_current", true);

  if (clearError) {
    return { ok: false, error: clearError.message };
  }

  const { error: insertError } = await supabase.from("position_ratings").insert({
    user_id: params.userId,
    position_id: params.positionId,
    stars: params.stars,
    category_scores: params.categoryScores as never,
    comment: params.comment,
    rated_by: params.ratedBy,
    is_current: true,
  });

  if (insertError && insertError.code !== UNIQUE_VIOLATION) {
    return { ok: false, error: insertError.message };
  }

  // Rating this position resolves any pending re-rate nudge for the pair.
  await supabase
    .from("rerate_prompts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("user_id", params.userId)
    .eq("position_id", params.positionId)
    .is("resolved_at", null);

  revalidatePath("/ratings");
  return { ok: true, data: undefined };
}

export async function quickRate(input: QuickRateInput): Promise<ActionResult> {
  try {
    await requirePermission("ratings.rate");
    const parsed = quickRateSchema.parse(input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    return await replaceCurrentRating(supabase, {
      userId: parsed.userId,
      positionId: parsed.positionId,
      stars: parsed.stars,
      categoryScores: null,
      comment: parsed.comment ? parsed.comment : null,
      ratedBy: userData.user?.id ?? null,
    });
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function rubricRate(input: RubricRateInput): Promise<ActionResult> {
  try {
    await requirePermission("ratings.rate");
    const parsed = rubricRateSchema.parse(input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    const categoryScores = {
      category_1: parsed.category1,
      category_2: parsed.category2,
      category_3: parsed.category3,
      category_4: parsed.category4,
    };
    const stars = averageCategoryScores(categoryScores);

    return await replaceCurrentRating(supabase, {
      userId: parsed.userId,
      positionId: parsed.positionId,
      stars,
      categoryScores,
      comment: parsed.comment ? parsed.comment : null,
      ratedBy: userData.user?.id ?? null,
    });
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function resolveRerate(input: ResolveRerateInput): Promise<ActionResult> {
  try {
    await requirePermission("ratings.rate");
    const parsed = resolveRerateSchema.parse(input);
    const supabase = await createClient();

    // Conditional update (only if still unresolved) so double-dismissing
    // the same prompt is a safe no-op.
    const { error } = await supabase
      .from("rerate_prompts")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", parsed.id)
      .is("resolved_at", null);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/ratings");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Admin: define/edit the up-to-4 rubric category names for a position.
 * Positions needing the full rubric vs. quick-rate only is a per-position
 * choice (ARCHITECTURE.md "Open questions" #5) -- presence of a row here is
 * what the UI uses to decide which rate form to show. */
export async function upsertRubric(input: UpsertRubricInput): Promise<ActionResult> {
  try {
    await requirePermission("training.manage");
    const parsed = upsertRubricSchema.parse(input);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("rating_rubrics")
      .select("id")
      .eq("position_id", parsed.positionId)
      .maybeSingle();

    const row = {
      position_id: parsed.positionId,
      category_1: parsed.category1 ? parsed.category1 : null,
      category_2: parsed.category2 ? parsed.category2 : null,
      category_3: parsed.category3 ? parsed.category3 : null,
      category_4: parsed.category4 ? parsed.category4 : null,
    };

    const { error } = existing
      ? await supabase.from("rating_rubrics").update(row).eq("id", existing.id)
      : await supabase.from("rating_rubrics").insert(row);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/ratings");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
