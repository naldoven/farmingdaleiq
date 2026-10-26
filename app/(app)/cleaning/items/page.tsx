import Link from "next/link";
import { Camera } from "lucide-react";

import {
  canPlanCleaning,
  loadItems,
  loadLastDone,
  loadLatestPhotos,
  loadStoreClock,
  loadZones,
  signPhotoUrls,
  type PhotoRow,
} from "@/app/(app)/cleaning/queries";
import { chunk, dueContext, toListRows } from "@/app/(app)/cleaning/items/view";
import { ItemList } from "@/components/cleaning/item-list";
import { Button } from "@/components/ui/button";
import { PermissionError, hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /cleaning/items (docs/CLEANING-PLAN.md "Phase W" and the Screens table):
 * the master list by zone, drafts first. Leaders see it; planners also
 * approve, delete and edit. After the walkthrough this is where the owner
 * reviews every draft on his phone. Active items also carry the audit view
 * (plan "How a week runs" step 6): a due dot for variables and the last-cleaned
 * date for everything, so the list answers "is anything overdue?" at a glance.
 *
 * Readers hold cleaning.complete or plan rights (the coordinator tag counts),
 * the same test the walkthrough route and the table RLS apply, so a plain
 * requirePermission would lock out a coordinator who lacks the key.
 */
export const metadata = { title: "Cleaning items" };

export default async function CleaningItemsPage() {
  const supabase = await createClient();
  const [canComplete, canPlan] = await Promise.all([
    hasPermission("cleaning.complete"),
    canPlanCleaning(supabase),
  ]);
  if (!canComplete && !canPlan) {
    // Same outcome as requirePermission: the (app) error boundary renders the
    // friendly "couldn't open this page" screen.
    throw new PermissionError("cleaning.complete");
  }

  const [zones, items, clock] = await Promise.all([
    loadZones(supabase),
    loadItems(supabase, ["draft", "active"]),
    loadStoreClock(supabase),
  ]);

  // Last-cleaned dates come from completion records, never typed in, and
  // "today" is the store's, not the server's (Vercel runs in UTC).
  const [lastDone, photoBatches] = await Promise.all([
    loadLastDone(supabase, clock.timeZone),
    Promise.all(
      chunk(
        items.map((item) => item.id),
        100,
      ).map((ids) => loadLatestPhotos(supabase, ids)),
    ),
  ]);
  const photos = new Map<string, PhotoRow>();
  for (const batch of photoBatches) for (const [itemId, photo] of batch) photos.set(itemId, photo);

  // One batched call for the whole page; per-photo signing dropped results
  // under load in the Quote Tool (see signPhotoUrls).
  const signedUrls = await signPhotoUrls(
    supabase,
    [...photos.values()].map((photo) => photo.storage_path),
  );

  const rows = toListRows(items, photos, signedUrls, dueContext(clock.today, lastDone));
  const draftCount = rows.filter((row) => row.status === "draft").length;

  const summary =
    `${rows.length} ${rows.length === 1 ? "item" : "items"}, ` +
    (draftCount === 0
      ? "no drafts to review"
      : `${draftCount} ${draftCount === 1 ? "draft" : "drafts"} to review`);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-bold leading-tight text-ink">Cleaning items</h1>
        <p className="text-[15px] text-muted-ink">{summary}</p>
      </div>

      {canComplete ? (
        <Button asChild className="h-14 w-full rounded-xl text-[17px]">
          <Link href="/cleaning/walkthrough">
            <Camera className="size-5" aria-hidden="true" />
            Start walkthrough
          </Link>
        </Button>
      ) : null}

      <ItemList zones={zones} rows={rows} canPlan={canPlan} />
    </div>
  );
}
