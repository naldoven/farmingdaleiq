import type { SupabaseClient } from "@supabase/supabase-js";

import { reservationBlockedReason } from "@/app/(app)/catering/drivers/logic";
import { loadOrderDrivers } from "@/app/(app)/catering/drivers/queries";
import type { DriverRef } from "@/components/catering/driver-status";
import type { Database } from "@/lib/db/types";

/**
 * Drivers for the orders a board or queue is about to render, in one query
 * for the whole list. Only delivery orders that can still take a driver get an
 * entry (an empty list means "Needs driver"); pickup and finished orders get
 * none, so their cards show nothing new.
 *
 * A failed read returns no entries at all, not empty lists. The badge is an
 * extra on a screen people rely on, and "Needs driver" on every card because
 * of a hiccup would be a false alarm; the Drivers page is where a failure
 * should be loud.
 */
export async function loadDriverBadges(
  supabase: SupabaseClient<Database>,
  orders: { id: string; fulfillment: string | null; stage: string }[],
): Promise<Map<string, DriverRef[]>> {
  const tracked = orders.filter((order) => reservationBlockedReason(order) === null).map((order) => order.id);
  if (tracked.length === 0) return new Map();
  try {
    const found = await loadOrderDrivers(supabase, tracked);
    return new Map(tracked.map((id) => [id, found.get(id) ?? []]));
  } catch (error) {
    console.error("catering: could not load drivers for the order badges", error);
    return new Map();
  }
}
