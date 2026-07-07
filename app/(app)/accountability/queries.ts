import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

/**
 * Row shape of the `my_infractions` view (supabase/migrations/
 * 20260707030000_accountability_rls.sql) -- every `infractions` column
 * except `issued_by`, plus the joined type name.
 */
export interface MyInfractionRow {
  id: string;
  user_id: string;
  type_id: string;
  type_name: string;
  points: number;
  note: string | null;
  issued_at: string;
  expires_at: string | null;
}

/**
 * Reads the signed-in user's own infractions through the `my_infractions`
 * view. This is the anonymity rule's enforcement point (ARCHITECTURE.md:
 * "infractions.issued_by is stored for audit but excluded from the
 * recipient-facing API/RLS view"): the view itself has no `issued_by` column
 * and there is no SELECT policy granting ordinary members access to the base
 * `infractions` table, so the omission holds even for a caller that bypasses
 * this helper and hits PostgREST directly.
 *
 * The view isn't part of the generated `Database` type -- lib/db/types.ts is
 * shared/frozen after P0 and only regenerated there (docs/agent-map.md) --
 * so this helper narrows the client to an untyped `.from()` call in exactly
 * one place and hands back a typed result. This is a type-level-only
 * workaround; PostgREST resolves table/view names at runtime regardless of
 * what the generated TS types know about.
 */
export async function fetchMyInfractions(
  supabase: SupabaseClient<Database>,
): Promise<{ data: MyInfractionRow[]; error: string | null }> {
  const untyped = supabase as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("my_infractions")
    .select("id, user_id, type_id, type_name, points, note, issued_at, expires_at")
    .order("issued_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }
  return { data: (data ?? []) as MyInfractionRow[], error: null };
}
