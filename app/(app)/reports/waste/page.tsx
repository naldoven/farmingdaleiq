import type {
  WasteCategoryForRollup,
  WasteEntryForRollup,
  WasteItemForRollup,
} from "@/app/(app)/waste/logic";
import { WastePeriodReport } from "@/components/reports/waste-period-report";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { fetchWasteReportData } from "../queries";

/**
 * /reports/waste -- waste logged by item and category, sliced by a
 * client-side period control (week/month/quarter/all). Same rollups the old
 * "Waste" tab used (WastePeriodReport, unchanged); reports.view alone is
 * enough since waste_entries/items/categories carry a select_authenticated
 * RLS policy.
 */
export default async function WasteReportPage() {
  await requirePermission("reports.view");

  const supabase = await createClient();
  const base = await fetchWasteReportData(supabase);

  const wasteEntries: WasteEntryForRollup[] = base.wasteEntries.map((e) => ({
    id: e.id,
    itemId: e.item_id,
    quantity: e.quantity,
    loggedAt: e.logged_at,
  }));
  const wasteItems: WasteItemForRollup[] = base.wasteItems.map((i) => ({
    id: i.id,
    name: i.name,
    categoryId: i.category_id,
    unit: i.unit as WasteItemForRollup["unit"],
    unitCost: i.unit_cost,
  }));
  const wasteCategories: WasteCategoryForRollup[] = base.wasteCategories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-[22px] font-bold text-ink">Waste</h2>
        <p className="text-[13px] text-muted-ink">Waste logged by item and category, sliced by period.</p>
      </div>
      <WastePeriodReport entries={wasteEntries} items={wasteItems} categories={wasteCategories} />
    </div>
  );
}
