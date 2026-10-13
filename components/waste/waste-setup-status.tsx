import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/mobile";
import type { WasteConfigurationStatus } from "@/app/(app)/waste/logic";

/**
 * Configuration is intentionally explicit: Farmingdale's categories, items,
 * units, and costs must come from the store, not an example list. Costs can
 * follow later because recording waste accurately is still better than
 * silently treating unconfirmed food cost as zero.
 *
 * Setup is a manager's job, so team members only ever see a one-line message,
 * and only when there is nothing they can log. While at least one item is
 * loggable the card is invisible to them: it must not nag every visit.
 */
export function WasteSetupStatus({
  status,
  canManage,
}: {
  status: WasteConfigurationStatus;
  canManage: boolean;
}) {
  if (!status.isReadyToLog) {
    if (!canManage) {
      return (
        <SectionCard title="Waste logging">
          <p className="text-[13px] text-muted-ink">
            Waste logging isn&apos;t set up yet. Ask a manager.
          </p>
        </SectionCard>
      );
    }

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
          <Button asChild className="self-start">
            <Link href="/waste?tab=admin">Configure waste</Link>
          </Button>
        </div>
      </SectionCard>
    );
  }

  if (!canManage) return null;

  const hiddenCount = status.uncategorizedItemCount;

  return (
    <>
      {hiddenCount > 0 && (
        <SectionCard title="Items hidden from logging" className="border-warning bg-warning-soft/40">
          <p className="text-[13px] text-muted-ink">
            {hiddenCount === 1
              ? "1 item has no category, so it is hidden from the log screen. Put it in a category to bring it back."
              : `${hiddenCount} items have no category, so they are hidden from the log screen. Put each one in a category to bring them back.`}
          </p>
        </SectionCard>
      )}

      <SectionCard title="Confirm store configuration">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted-ink">
            Check that categories, units, and costs match the store.
          </p>
          {status.unpricedItemCount > 0 && (
            <p className="text-[13px] text-muted-ink">
              {status.unpricedItemCount} {status.unpricedItemCount === 1 ? "item has" : "items have"} no confirmed unit cost. Entries still log normally; their dollar totals remain unknown until a manager adds the confirmed cost.
            </p>
          )}
          <Button asChild className="self-start" variant="secondary">
            <Link href="/waste?tab=admin">Review configuration</Link>
          </Button>
        </div>
      </SectionCard>
    </>
  );
}
