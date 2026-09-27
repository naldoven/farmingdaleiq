import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/mobile";
import type { WasteConfigurationStatus } from "@/app/(app)/waste/logic";

/**
 * Configuration is intentionally explicit: Farmingdale's categories, items,
 * units, and costs must come from the store, not an example list. Costs can
 * follow later because recording waste accurately is still better than
 * silently treating unconfirmed food cost as zero.
 */
export function WasteSetupStatus({
  status,
  canManage,
}: {
  status: WasteConfigurationStatus;
  canManage: boolean;
}) {
  if (!status.isReadyToLog) {
    return (
      <SectionCard title="Waste setup required">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted-ink">
            Logging stays off until a manager enters Farmingdale&apos;s approved categories, item
            names, and units. This screen does not create a default category, item, unit, or cost.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-ink">
            {status.categoryCount === 0 && <li>Add the store&apos;s waste categories.</li>}
            {status.itemCount === 0 && <li>Add each approved waste item and its unit.</li>}
            {status.uncategorizedItemCount > 0 && (
              <li>
                Put {status.uncategorizedItemCount} existing {status.uncategorizedItemCount === 1 ? "item" : "items"} in a category.
              </li>
            )}
          </ul>
          {canManage && (
            <Button asChild className="self-start">
              <Link href="/waste?tab=admin">Configure waste</Link>
            </Button>
          )}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Confirm store configuration">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted-ink">
          Before full rollout, a manager must verify Farmingdale&apos;s categories, item names, units,
          and any unit costs. Existing values may be prior imports, not confirmed store defaults.
        </p>
        {status.unpricedItemCount > 0 && (
          <p className="text-[13px] text-muted-ink">
            {status.unpricedItemCount} {status.unpricedItemCount === 1 ? "item has" : "items have"} no confirmed unit cost. Entries still log normally; their dollar totals remain unknown until a manager adds the confirmed cost.
          </p>
        )}
        {canManage && (
          <Button asChild className="self-start" variant="secondary">
            <Link href="/waste?tab=admin">Review configuration</Link>
          </Button>
        )}
      </div>
    </SectionCard>
  );
}
