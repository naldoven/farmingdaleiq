import { canPlanCleaning, loadItems, loadZones } from "@/app/(app)/cleaning/queries";
import { WalkthroughCamera } from "@/components/cleaning/walkthrough-camera";
import { hasPermission, PermissionError } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Walkthrough camera (docs/CLEANING-PLAN.md "Phase W"). Leaders walk the
 * building and photograph every cleanable thing; each save lands as a draft
 * on the master list (/cleaning/items) for a planner to approve.
 *
 * Every zone is offered, FOH included: a zone's `active` flag only decides
 * whether it appears on the weekly board, and the walk covers the whole
 * store. BOH zones come first (zone sort order).
 */
export default async function CleaningWalkthroughPage() {
  const supabase = await createClient();
  const allowed = (await hasPermission("cleaning.complete")) || (await canPlanCleaning(supabase));
  if (!allowed) throw new PermissionError("cleaning.complete");

  const [zones, items] = await Promise.all([loadZones(supabase), loadItems(supabase, ["draft", "active"])]);

  return (
    <WalkthroughCamera
      exitHref="/cleaning/items"
      zones={zones.map((z) => ({ id: z.id, name: z.name, color: z.color, side: z.side }))}
      items={items.map((i) => ({
        id: i.id,
        zone_id: i.zone_id,
        name: i.name,
        kind: i.kind,
        days_of_week: i.days_of_week,
        half: i.half,
        interval_weeks: i.interval_weeks,
      }))}
    />
  );
}
