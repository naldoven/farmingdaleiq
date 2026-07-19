"use server";

/**
 * Station Grid server actions (ARCHITECTURE.md "Trainee lifecycle" >
 * "Station grid"). Follows the People/Teams permission-guard pattern.
 *
 * Idempotency: enrollTrainee checks for an existing active enrollment first
 * (safe to call twice). cycleStationProgress is a deliberate click-to-cycle
 * control (PLAN.md's double-submit examples are post/complete/claim/stamp --
 * a manual cycle click is expected to advance state every time, that's the
 * feature), but the graduation side effect it can trigger is atomic and
 * idempotent: the status flip and the graduation_audits insert run together
 * inside the graduate_trainee() SECURITY DEFINER function (TR3), which no-ops
 * when the trainee is already graduated with an audit and re-creates a missing
 * audit otherwise, so an interrupt can't leave a trainee graduated with no
 * audit.
 */

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/bus";
import type { ActionResult } from "@/app/(app)/training/action-types";
import { replaceCurrentRating } from "@/app/(app)/ratings/actions";
import { cycleStation, isRoadmapComplete, type StationState } from "@/app/(app)/training/grid/logic";
import {
  cycleStationSchema,
  enrollTraineeSchema,
  type CycleStationInput,
  type EnrollTraineeInput,
} from "@/app/(app)/training/grid/validation";

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
    console.error(`training grid: emitEvent(${key}) failed`, error);
  }
}

/** Enrolls a trainee on a roadmap and materializes a not_started
 * station_progress row per roadmap station. Safe to call twice: returns the
 * existing active enrollment instead of creating a second one. */
export async function enrollTrainee(input: EnrollTraineeInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.manage");
    const parsed = enrollTraineeSchema.parse(input);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("trainee_enrollments")
      .select("id")
      .eq("user_id", parsed.userId)
      .eq("roadmap_id", parsed.roadmapId)
      .eq("status", "active")
      .maybeSingle();

    let enrollmentId = existing?.id ?? null;

    if (!enrollmentId) {
      const { data, error } = await supabase
        .from("trainee_enrollments")
        .insert({ user_id: parsed.userId, roadmap_id: parsed.roadmapId })
        .select("id")
        .single();
      if (error || !data) {
        return { ok: false, error: error?.message ?? "Could not enroll the trainee." };
      }
      enrollmentId = data.id;
    }

    const { data: stations } = await supabase
      .from("roadmap_stations")
      .select("id")
      .eq("roadmap_id", parsed.roadmapId);

    for (const station of stations ?? []) {
      const { data: existingProgress } = await supabase
        .from("station_progress")
        .select("id")
        .eq("enrollment_id", enrollmentId)
        .eq("roadmap_station_id", station.id)
        .maybeSingle();
      if (!existingProgress) {
        await supabase.from("station_progress").insert({
          enrollment_id: enrollmentId,
          roadmap_station_id: station.id,
          status: "not_started",
        });
      }
    }

    revalidatePath("/training/grid");
    return { ok: true, data: { id: enrollmentId } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

async function findOrCreatePositionPassportEnrollment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  positionId: string,
  userId: string,
): Promise<string | null> {
  const { data: passport } = await supabase
    .from("passports")
    .select("id")
    .eq("kind", "position")
    .eq("position_id", positionId)
    .maybeSingle();
  if (!passport) return null;

  const { data: existing } = await supabase
    .from("passport_enrollments")
    .select("id")
    .eq("passport_id", passport.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("passport_enrollments")
    .insert({ passport_id: passport.id, user_id: userId })
    .select("id")
    .single();
  return created?.id ?? null;
}

/**
 * Advances a station cell one step through the cycle. When the new state is
 * "scored", also writes a quick position rating (ARCHITECTURE.md: "A score
 * writes a quick position rating ... and updates the passport item progress
 * for that station") and, once every station on the roadmap has been
 * scored, graduates the trainee and opens their 30-day audit.
 *
 * Design note: "updates the passport item progress for that station" is
 * interpreted here as marking every check-type item on that position's
 * auto-created Position Passport complete for this trainee -- the schema
 * doesn't carry an explicit station-to-item mapping, and check items are the
 * self-evident "knows this station" signal; slider/photo/signature items on
 * that passport are left to their own explicit flows on /training.
 */
export async function cycleStationProgress(
  input: CycleStationInput,
): Promise<ActionResult<{ status: StationState["status"]; score: number | null }>> {
  try {
    await requirePermission("training.stamp");
    const parsed = cycleStationSchema.parse(input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const trainerId = userData.user?.id ?? null;

    const { data: current } = await supabase
      .from("station_progress")
      .select("id, status, score, enrollment_id, roadmap_station_id")
      .eq("enrollment_id", parsed.enrollmentId)
      .eq("roadmap_station_id", parsed.roadmapStationId)
      .maybeSingle();

    if (!current) {
      return { ok: false, error: "Station progress row not found (enroll the trainee first)." };
    }

    const next = cycleStation({
      status: current.status as StationState["status"],
      score: current.score,
    });

    const { error: updateError } = await supabase
      .from("station_progress")
      .update({
        status: next.status,
        score: next.score,
        scored_by: next.status === "scored" ? trainerId : null,
        scored_at: next.status === "scored" ? new Date().toISOString() : null,
      })
      .eq("id", current.id);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    // TR4: leaving 'scored' (the score-5 -> not_started wrap). The quick
    // position rating written when this station was scored must stop being
    // current, or the grid shows a reset station while /ratings and the
    // 3-star stamp gate still read a stale is_current rating.
    if (current.status === "scored" && next.status !== "scored") {
      const { data: station } = await supabase
        .from("roadmap_stations")
        .select("position_id")
        .eq("id", parsed.roadmapStationId)
        .maybeSingle();
      const { data: enrollment } = await supabase
        .from("trainee_enrollments")
        .select("user_id")
        .eq("id", parsed.enrollmentId)
        .maybeSingle();
      if (station?.position_id && enrollment?.user_id) {
        await supabase
          .from("position_ratings")
          .update({ is_current: false })
          .eq("user_id", enrollment.user_id)
          .eq("position_id", station.position_id)
          .eq("is_current", true);
      }
    }

    if (next.status === "scored" && next.score !== null) {
      const { data: station } = await supabase
        .from("roadmap_stations")
        .select("position_id, roadmap_id")
        .eq("id", parsed.roadmapStationId)
        .maybeSingle();

      const { data: enrollment } = await supabase
        .from("trainee_enrollments")
        .select("id, user_id, roadmap_id, status")
        .eq("id", parsed.enrollmentId)
        .maybeSingle();

      if (station?.position_id && enrollment?.user_id) {
        await replaceCurrentRating(supabase, {
          userId: enrollment.user_id,
          positionId: station.position_id,
          stars: next.score,
          categoryScores: null,
          comment: "Scored via station grid",
          ratedBy: trainerId,
        });

        const ppEnrollmentId = await findOrCreatePositionPassportEnrollment(
          supabase,
          station.position_id,
          enrollment.user_id,
        );
        if (ppEnrollmentId) {
          const { data: passport } = await supabase
            .from("passports")
            .select("id")
            .eq("kind", "position")
            .eq("position_id", station.position_id)
            .maybeSingle();
          const { data: checkItems } = passport
            ? await supabase.from("passport_items").select("id").eq("passport_id", passport.id).eq("type", "check")
            : { data: [] };
          for (const item of checkItems ?? []) {
            const { data: existingProgress } = await supabase
              .from("passport_item_progress")
              .select("id")
              .eq("enrollment_id", ppEnrollmentId)
              .eq("item_id", item.id)
              .maybeSingle();
            const row = {
              enrollment_id: ppEnrollmentId,
              item_id: item.id,
              completed_at: new Date().toISOString(),
            };
            if (existingProgress) {
              await supabase.from("passport_item_progress").update(row).eq("id", existingProgress.id);
            } else {
              await supabase.from("passport_item_progress").insert(row);
            }
          }
        }
      }

      // Graduation check: every station on this roadmap now scored? The status
      // flip + audit insert run atomically inside the graduate_trainee
      // SECURITY DEFINER function (TR3) so an interrupt can't leave a trainee
      // graduated with no audit row. The function is idempotent and
      // self-healing, so calling it on every completed roadmap -- not only the
      // first time status is still 'active' -- is safe and doubles as the
      // recovery path for any enrollment that was left graduated-without-audit
      // by the old non-transactional code.
      if (enrollment) {
        const [{ data: allStations }, { data: allProgress }] = await Promise.all([
          supabase.from("roadmap_stations").select("id").eq("roadmap_id", enrollment.roadmap_id),
          supabase
            .from("station_progress")
            .select("status")
            .eq("enrollment_id", enrollment.id),
        ]);
        const scoredCount = (allProgress ?? []).filter((p) => p.status === "scored").length;
        if (isRoadmapComplete((allStations ?? []).length, scoredCount)) {
          const { data: gradRows, error: gradError } = await supabase.rpc("graduate_trainee", {
            p_enrollment_id: enrollment.id,
          });
          if (gradError) {
            // The station score already committed and graduation is now
            // transactional (all-or-nothing) and retriable, so don't fail the
            // score; the next station cycle re-runs the idempotent finalize.
            console.error("training grid: graduate_trainee RPC failed", gradError);
          } else {
            const grad = Array.isArray(gradRows) ? gradRows[0] : gradRows;
            // Only emit on a FRESH graduation. A recovery run (missing audit
            // re-created on an already-graduated enrollment) reports
            // graduated=false, so the event never double-fires.
            if (grad?.graduated) {
              await emitBestEffort("graduation_ready", {
                enrollmentId: enrollment.id,
                userId: enrollment.user_id,
              });
            }
          }
        }
      }
    }

    revalidatePath("/training/grid");
    revalidatePath("/training/graduates");
    revalidatePath("/ratings");
    return { ok: true, data: { status: next.status, score: next.score } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
