/**
 * P2 wiring (PLAN.md "Phase 2" item 1: "badges use break engine + trainee
 * status across modules", docs/agent-map.md "Wiring"): the S4-backed source
 * for the Trainee highlight badge.
 *
 * lib/setups/badges.ts (S3) computes every badge as a pure function and, for
 * trainee status, defined a `TraineeStatusLookup` interface stubbed to always
 * return false until S4 landed. This module is the only place that reads S4's
 * `trainee_enrollments`, so anywhere people are rendered (setup board, roster,
 * profile) can call `loadTraineeUserIds` once for the people on screen and
 * feed the result into `computeBadges({ ..., isTrainee })`.
 *
 * "Active trainee" = an enrollment with status 'active' (a graduated or PIP'd
 * enrollment is not a current trainee — supabase/migrations/
 * 20260707000600_trainee_lifecycle.sql).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

export async function loadTraineeUserIds(
  client: SupabaseClient<Database>,
  userIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (userIds.length === 0) return set;

  const { data } = await client
    .from("trainee_enrollments")
    .select("user_id")
    .eq("status", "active")
    .in("user_id", userIds);

  for (const row of data ?? []) {
    if (row.user_id) set.add(row.user_id);
  }
  return set;
}
