import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { isStoreSetupAreaKey, type StoreSetupAreaKey } from "@/lib/store-setup/areas";

export interface ConfirmedAreas {
  keys: ReadonlySet<StoreSetupAreaKey>;
  /** Set when the read failed; callers decide whether to say so. */
  error: string | null;
}

/**
 * Reads which setup areas a manager has marked confirmed. Any signed-in
 * member can read the table (RLS in 20261025000000_store_setup_areas.sql),
 * so editor pages call this to decide whether to show the "Default, not
 * confirmed" tag.
 *
 * Fails soft on purpose: a read error returns an empty set, which renders
 * every area as "still default". That is the truthful state until the table
 * exists and a manager confirms something, and it keeps a transient read
 * failure from taking down a page whose real job is logging waste or rating
 * a station. The Store setup page shows `error` so a manager is not misled.
 */
export async function getConfirmedAreas(supabase: SupabaseClient<Database>): Promise<ConfirmedAreas> {
  const { data, error } = await supabase.from("store_setup_areas").select("area_key");
  if (error) {
    return { keys: new Set(), error: error.message };
  }
  const keys = new Set<StoreSetupAreaKey>();
  for (const row of data ?? []) {
    if (isStoreSetupAreaKey(row.area_key)) keys.add(row.area_key);
  }
  return { keys, error: null };
}
