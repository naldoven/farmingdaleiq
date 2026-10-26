import type { SupabaseClient } from "@supabase/supabase-js";

import { FIND_PAGE_LIMIT, buildFindsView, postableZones } from "@/app/(app)/cleaning/finds-view";
import { canPlanCleaning, loadZones, signPhotoUrls } from "@/app/(app)/cleaning/queries";
import { FindFeed } from "@/components/cleaning/find-feed";
import { FindPostButton } from "@/components/cleaning/find-post-button";
import { PermissionError, hasPermission } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

type Client = SupabaseClient<Database>;

/**
 * /cleaning/finds, the found-and-fixed log (docs/CLEANING-PLAN.md "Decisions":
 * ATD log): a leader fixes something that is on no list and posts a photo, the
 * area and a one-line note. Leaders only in v1. A planner can turn a find into
 * a master-list item.
 *
 * Readers hold cleaning.complete or plan rights (the coordinator tag counts),
 * the same test the post route and the table RLS apply, so a plain
 * requirePermission would lock out a coordinator who lacks the key. The poster's
 * first name shows here because this screen is leaders only; the #cleaning post
 * for the same find never carries a name.
 */
export const metadata = { title: "Found and fixed" };

async function loadFinds(supabase: Client) {
  const { data, error } = await supabase
    .from("cleaning_atd_finds")
    .select("*")
    .order("posted_at", { ascending: false })
    .limit(FIND_PAGE_LIMIT);
  if (error) throw new Error(`Could not load the finds: ${error.message}`);
  return data ?? [];
}

/** Profile id to name. A name that fails to load just drops the name. */
async function loadNames(supabase: Client, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data } = await supabase.from("profiles").select("id, name").in("id", ids);
  for (const row of data ?? []) names.set(row.id, row.name);
  return names;
}

export default async function CleaningFindsPage() {
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

  const [zones, finds] = await Promise.all([loadZones(supabase), loadFinds(supabase)]);
  const posterIds = [...new Set(finds.map((find) => find.posted_by))];
  const [people, photoUrls] = await Promise.all([
    loadNames(supabase, posterIds),
    // One batched call for the whole page; per-photo signing dropped results
    // under load in the Quote Tool (see signPhotoUrls).
    signPhotoUrls(
      supabase,
      finds.map((find) => find.photo_path),
    ),
  ]);

  const cards = buildFindsView({
    finds,
    zones: new Map(zones.map((zone) => [zone.id, zone])),
    people,
    photoUrls,
    canPlan,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-bold leading-tight text-ink">Found and fixed</h1>
        <p className="text-[15px] text-muted-ink">Something dirty that was on no list, and you fixed it. Post it.</p>
      </div>

      <FindPostButton zones={postableZones(zones)} />

      <FindFeed
        cards={cards}
        // Every area, switched off or not: a find in one can still become an item.
        zones={zones.map(({ id, name, color, side }) => ({ id, name, color, side }))}
      />

      {cards.length >= FIND_PAGE_LIMIT ? (
        <p className="text-center text-[13px] text-muted-ink">Showing the newest {FIND_PAGE_LIMIT} finds.</p>
      ) : null}
    </div>
  );
}
