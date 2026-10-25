import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import {
  deleteRefusalMessage,
  type PositionHistory,
} from "@/app/(app)/settings/positions/logic";

/**
 * Delete guard for /settings/positions. The delete RPCs (20260718010300)
 * permanently remove a position's ratings, its passport with every trainee's
 * enrollment and stamped items, and setup wiring, with no warning. The server
 * actions call this first and refuse when real history exists.
 *
 * Not a "use server" file: it exports a plain helper, and the actions import
 * it. Counts run through the per-request client. Every table read here is
 * readable by any signed-in member (20260707020000_training_rls.sql), so RLS
 * cannot hide rows and under-count.
 *
 * Tables checked, in order:
 *   position_ratings        by position_id
 *   passports               by position_id (the position's own passport)
 *   passport_enrollments    by passport_id
 *   passport_item_progress  by its enrollment's passport_id
 *
 * Fails closed: any read error returns an error, never zero counts, so a
 * failed lookup cannot turn into a delete. Check-then-delete is not atomic;
 * a rating saved in the gap before the RPC runs is still erased. The window
 * is a few milliseconds on a screen only a manager uses, and closing it needs
 * the check inside the RPC (a follow-up migration).
 */

export type HistoryLookup =
  | { ok: true; history: PositionHistory }
  | { ok: false; error: string };

const LOOKUP_FAILED = "Could not check this position's history, so nothing was deleted. Try again.";

export async function countPositionHistory(
  supabase: SupabaseClient<Database>,
  positionIds: readonly string[],
): Promise<HistoryLookup> {
  const none: PositionHistory = { ratings: 0, enrollments: 0, itemRecords: 0 };
  if (positionIds.length === 0) return { ok: true, history: none };
  const ids = [...positionIds];

  const ratings = await supabase
    .from("position_ratings")
    .select("id", { count: "exact", head: true })
    .in("position_id", ids);
  if (ratings.error || ratings.count === null) return { ok: false, error: LOOKUP_FAILED };

  const passports = await supabase.from("passports").select("id").in("position_id", ids);
  if (passports.error) return { ok: false, error: LOOKUP_FAILED };
  const passportIds = (passports.data ?? []).map((p) => p.id);

  if (passportIds.length === 0) {
    return { ok: true, history: { ratings: ratings.count, enrollments: 0, itemRecords: 0 } };
  }

  const enrollments = await supabase
    .from("passport_enrollments")
    .select("id", { count: "exact", head: true })
    .in("passport_id", passportIds);
  if (enrollments.error || enrollments.count === null) return { ok: false, error: LOOKUP_FAILED };

  // Counted through the enrollment so the filter is a short list of passport
  // ids, not a list of every enrollment id (that would overflow the URL).
  const itemRecords = await supabase
    .from("passport_item_progress")
    .select("id, passport_enrollments!inner(passport_id)", { count: "exact", head: true })
    .in("passport_enrollments.passport_id", passportIds);
  if (itemRecords.error || itemRecords.count === null) return { ok: false, error: LOOKUP_FAILED };

  return {
    ok: true,
    history: {
      ratings: ratings.count,
      enrollments: enrollments.count,
      itemRecords: itemRecords.count,
    },
  };
}

/**
 * Returns the refusal text when deleting the given positions would erase
 * history (or the lookup failed), or null when the delete may proceed.
 */
export async function deleteGuard(
  supabase: SupabaseClient<Database>,
  target: { kind: "position" | "group"; name: string },
  positionIds: readonly string[],
): Promise<string | null> {
  const lookup = await countPositionHistory(supabase, positionIds);
  if (!lookup.ok) return lookup.error;
  return deleteRefusalMessage(target, lookup.history);
}
