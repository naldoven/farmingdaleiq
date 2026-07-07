/**
 * P2 wiring (PLAN.md "Phase 2" item 1: "auto-place uses real ratings
 * (S3 -> S4)", docs/agent-map.md "Wiring"): the real, S4-backed implementation
 * of the `PositionRatingLookup` interface that lib/setups/auto-place.ts
 * defined and stubbed until this seam landed.
 *
 * lib/setups/auto-place.ts (S3) never imports S4's tables directly — it only
 * knows the `PositionRatingLookup` shape. This module is the only place that
 * reads S4's `position_ratings` / `passports` tables, so the module boundary
 * stays intact: swapping the stub for `createPositionRatingLookup(client)` is
 * the entire wire-up.
 *
 * Beyond ranking, PLAN.md asks auto-place to "flag under-3-star /
 * unstamped-passport assignments". `loadPositionSuitability` returns, per
 * candidate, the current star rating plus whether the position's development
 * passport has been stamped (the 3-star stamp gate, ARCHITECTURE.md "Position
 * Ratings" / "Development Passports"), so the setup board can warn when
 * someone is being placed on a position they're under-qualified for.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import type { PositionRatingLookup } from "@/lib/setups/auto-place";

/** Ratings below this are flagged as under-qualified (ARCHITECTURE.md: the
 * 3-star stamp gate is the "qualified on this position" bar). */
export const MIN_QUALIFIED_STARS = 3;

export interface PositionSuitability {
  /** Current star rating (0-5) for this position, or null if never rated. */
  rating: number | null;
  /** true if the person is under the 3-star qualification bar (unrated counts
   * as under-qualified). */
  underThreeStars: boolean;
  /** true if a position development passport exists for this position but the
   * person has not earned its stamp; false if stamped; null if the position
   * has no passport program at all. */
  passportStamped: boolean | null;
  /** true only when a passport program exists AND it is not stamped. */
  unstampedPassport: boolean;
}

/**
 * The S4-backed lookup passed into lib/setups/auto-place.ts's
 * `rankCandidatesForPosition`. Reads only the current rating for a
 * (user, position). One row per query keeps it drop-in compatible with the
 * stubbed interface; batch callers should prefer `loadPositionSuitability`.
 */
export function createPositionRatingLookup(
  client: SupabaseClient<Database>,
): PositionRatingLookup {
  return {
    async getPositionRating(userId: string, positionId: string): Promise<number | null> {
      const { data } = await client
        .from("position_ratings")
        .select("stars")
        .eq("user_id", userId)
        .eq("position_id", positionId)
        .eq("is_current", true)
        .maybeSingle();
      return data ? Number(data.stars) : null;
    },
  };
}

/**
 * Batch-loads suitability (rating + passport-stamp status) for a set of
 * candidates on one position. Pure DB reads over S4 tables; the flag math is
 * in `computeSuitability` so it is unit-testable without a database.
 */
export async function loadPositionSuitability(
  client: SupabaseClient<Database>,
  candidateUserIds: string[],
  positionId: string,
): Promise<Map<string, PositionSuitability>> {
  const result = new Map<string, PositionSuitability>();
  if (candidateUserIds.length === 0) return result;

  const [{ data: ratings }, { data: passports }] = await Promise.all([
    client
      .from("position_ratings")
      .select("user_id, stars")
      .eq("position_id", positionId)
      .eq("is_current", true)
      .in("user_id", candidateUserIds),
    client.from("passports").select("id").eq("kind", "position").eq("position_id", positionId).eq("active", true),
  ]);

  const ratingByUser = new Map<string, number>();
  for (const row of ratings ?? []) {
    if (row.user_id) ratingByUser.set(row.user_id, Number(row.stars));
  }

  const passportIds = (passports ?? []).map((p) => p.id);
  const stampedUsers = new Set<string>();
  const hasPassportProgram = passportIds.length > 0;

  if (hasPassportProgram) {
    const { data: enrollments } = await client
      .from("passport_enrollments")
      .select("user_id, stamped_at")
      .in("passport_id", passportIds)
      .in("user_id", candidateUserIds)
      .not("stamped_at", "is", null);
    for (const row of enrollments ?? []) {
      if (row.user_id) stampedUsers.add(row.user_id);
    }
  }

  for (const userId of candidateUserIds) {
    result.set(
      userId,
      computeSuitability({
        rating: ratingByUser.has(userId) ? (ratingByUser.get(userId) as number) : null,
        hasPassportProgram,
        stamped: stampedUsers.has(userId),
      }),
    );
  }

  return result;
}

/** Pure flag math (unit-tested). */
export function computeSuitability(input: {
  rating: number | null;
  hasPassportProgram: boolean;
  stamped: boolean;
}): PositionSuitability {
  const underThreeStars = input.rating === null || input.rating < MIN_QUALIFIED_STARS;
  const passportStamped = input.hasPassportProgram ? input.stamped : null;
  const unstampedPassport = input.hasPassportProgram && !input.stamped;
  return {
    rating: input.rating,
    underThreeStars,
    passportStamped,
    unstampedPassport,
  };
}
