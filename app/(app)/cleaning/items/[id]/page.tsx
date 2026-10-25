import { notFound } from "next/navigation";

import {
  canPlanCleaning,
  loadLatestPhotos,
  loadZones,
  signPhotoUrls,
} from "@/app/(app)/cleaning/queries";
import { isUuid, itemCadence, itemToDetailsValue, parseMarkup } from "@/app/(app)/cleaning/items/view";
import { ItemEditor } from "@/components/cleaning/item-editor";
import { PhotoWithMarkup } from "@/components/cleaning/photo-with-markup";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { PermissionError, hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatStoreDateTime } from "@/lib/time";

/**
 * /cleaning/items/[id]: one master-list item with its full photo and
 * drawing. Planners edit, approve, retire or delete here; everyone else with
 * access sees the same page read-only. Not a nav route; it opens from the
 * list.
 */
export const metadata = { title: "Cleaning item" };

const STATUS_BADGE = {
  draft: { tone: "warning", label: "Draft" },
  active: { tone: "success", label: "Active" },
  retired: { tone: "neutral", label: "Retired" },
} as const;

export default async function CleaningItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const [canComplete, canPlan] = await Promise.all([
    hasPermission("cleaning.complete"),
    canPlanCleaning(supabase),
  ]);
  if (!canComplete && !canPlan) {
    throw new PermissionError("cleaning.complete");
  }

  if (!isUuid(id)) notFound();

  const [zones, itemResult, photos] = await Promise.all([
    loadZones(supabase),
    supabase.from("cleaning_items").select("*").eq("id", id).maybeSingle(),
    loadLatestPhotos(supabase, [id]),
  ]);
  if (itemResult.error) throw new Error(`Could not load the item: ${itemResult.error.message}`);
  const item = itemResult.data;
  if (!item) notFound();

  const photo = photos.get(id) ?? null;
  const [signedUrls, takerResult] = await Promise.all([
    signPhotoUrls(supabase, photo ? [photo.storage_path] : []),
    photo
      ? supabase.from("profiles").select("name").eq("id", photo.taken_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const photoUrl = photo ? (signedUrls.get(photo.storage_path) ?? null) : null;
  const takenBy = takerResult.data?.name ?? null;

  const zone = zones.find((z) => z.id === item.zone_id) ?? null;
  const badge = STATUS_BADGE[item.status as keyof typeof STATUS_BADGE] ?? STATUS_BADGE.draft;
  const status = item.status === "active" || item.status === "retired" ? item.status : "draft";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="break-words text-[22px] font-bold leading-tight text-ink">{item.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={badge.tone} dot>
            {badge.label}
          </StatusBadge>
          {item.if_needed ? <StatusBadge tone="neutral">If needed</StatusBadge> : null}
          {zone ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full ring-1 ring-black/15"
                style={{ backgroundColor: zone.color }}
              />
              {zone.name}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <PhotoWithMarkup
          className="w-full rounded-2xl"
          src={photoUrl}
          markup={photo ? parseMarkup(photo.markup) : null}
          alt={`Photo of ${item.name}`}
          emptyLabel={photo ? "Photo unavailable" : undefined}
        />
        {photo ? (
          <p className="text-[13px] text-muted-ink">
            Photo taken{takenBy ? ` by ${takenBy}` : ""} on {formatStoreDateTime(photo.created_at)}
          </p>
        ) : null}
      </div>

      {canPlan ? (
        <ItemEditor
          id={item.id}
          status={status}
          initial={itemToDetailsValue(item)}
          // Only what the form needs crosses to the browser.
          zones={zones.map(({ id: zoneId, name, color, side }) => ({ id: zoneId, name, color, side }))}
        />
      ) : (
        <SectionCard title="Details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
            <dt className="text-muted-ink">Zone</dt>
            <dd className="text-ink">{zone?.name ?? "Unknown"}</dd>
            <dt className="text-muted-ink">Cleaned</dt>
            <dd className="text-ink">{itemCadence(item)}</dd>
            <dt className="text-muted-ink">If needed</dt>
            <dd className="text-ink">{item.if_needed ? "Yes" : "No"}</dd>
            {item.note ? (
              <>
                <dt className="text-muted-ink">Note</dt>
                <dd className="whitespace-pre-wrap break-words text-ink">{item.note}</dd>
              </>
            ) : null}
          </dl>
        </SectionCard>
      )}
    </div>
  );
}
