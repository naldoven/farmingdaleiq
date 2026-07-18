import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListRow, SectionCard } from "@/components/mobile";
import { CategoryManager } from "@/components/waste/category-manager";
import { DeleteEntryButton } from "@/components/waste/delete-entry-button";
import { ItemManager } from "@/components/waste/item-manager";
import { LogEntryForm } from "@/components/waste/log-entry-form";
import { WasteLogGrid } from "@/components/waste/waste-log-grid";
import { WasteReports } from "@/components/waste/waste-reports";
import { WasteViewTabs, type WasteTabKey } from "@/components/waste/waste-view-tabs";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { WasteEntryForRollup } from "@/app/(app)/waste/logic";
import type { WasteUnit } from "@/app/(app)/waste/validation";

/**
 * /waste -- ARCHITECTURE.md page map: "Quick waste logging; admin:
 * categories/items." PLAN.md S5 done-definition covers logging + admin CRUD
 * + rollups, all of which live on this single route (docs/agent-map.md only
 * lists "/waste" for this stream, unlike streams that were granted explicit
 * sub-routes), so it's one page with permission-gated sections rather than
 * separate routes. The KitchenIQ restyle (docs/DESIGN-SYSTEM.md) turns the
 * old shadcn Tabs into a ChipRow (WasteViewTabs) driven by a `tab` search
 * param -- same pattern as the `date` filter below -- so the server still
 * gates which section's data even gets fetched/rendered instead of trusting
 * client state.
 */
/** YYYY-MM-DD, no other characters -- guards the date search param before it
 * reaches a query bound (bad input just falls back to the default view). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Hard ceiling on an explicit date filter so a leader can't accidentally
 * request an unbounded scan; comfortably above any single day's real volume. */
const DATE_FILTER_LIMIT = 500;

export const metadata = { title: "Waste" };

export default async function WastePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string }>;
}) {
  // waste.log is a base permission granted to every seeded role (see
  // supabase/migrations/20260707001900_seed_store_config.sql base_keys), so
  // in practice every active team member can reach this page to log waste.
  await requirePermission("waste.log");
  const canManage = await hasPermission("waste.manage");
  // The same rollup is also reachable from /reports gated on reports.view
  // (Team Leader tier), one tier below waste.manage (Shift Supervisor tier).
  // Gating the tab here on the lower of the two keeps "can see the rollup"
  // consistent between the two entry points instead of a Team Leader seeing
  // it in one place and not the other.
  const canViewReports = canManage || (await hasPermission("reports.view"));

  const { date, tab } = await searchParams;
  const selectedDate = date && ISO_DATE_RE.test(date) ? date : null;

  // The ChipRow only ever links to a value it renders, but the tab still
  // decides what data-bearing content gets shown, so it's re-checked against
  // the same permissions the chips themselves are gated on rather than
  // trusted as-is from the URL.
  const requestedTab: WasteTabKey = tab === "reports" || tab === "admin" ? tab : "log";

  const supabase = await createClient();

  let recentEntriesQuery = supabase
    .from("waste_entries")
    .select("id, item_id, quantity, note, logged_at, day_part_id, logged_by")
    .order("logged_at", { ascending: false });

  if (selectedDate) {
    // Filtering by a specific day is an explicit, bounded query (unlike the
    // default view below), so it's safe to lift the normal 25-row cap.
    const dayStart = new Date(`${selectedDate}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    recentEntriesQuery = recentEntriesQuery
      .gte("logged_at", dayStart.toISOString())
      .lt("logged_at", dayEnd.toISOString())
      .limit(DATE_FILTER_LIMIT);
  } else {
    recentEntriesQuery = recentEntriesQuery.limit(25);
  }

  const [
    { data: categories },
    { data: items },
    { data: dayParts },
    { data: recentEntries },
    { data: allEntries },
  ] = await Promise.all([
    supabase.from("waste_categories").select("id, name, sort").order("sort"),
    supabase
      .from("waste_items")
      .select("id, name, category_id, unit, unit_cost")
      .order("name"),
    supabase.from("day_parts").select("id, name").order("sort"),
    recentEntriesQuery,
    // Reports tab is manager/reports-tier only, so only pull the full entry
    // history when it's actually needed for the rollups.
    canViewReports
      ? supabase.from("waste_entries").select("id, item_id, quantity, logged_at")
      : Promise.resolve({ data: [] as { id: string; item_id: string; quantity: number; logged_at: string }[] }),
  ]);

  const categoryRows = categories ?? [];
  const itemRows = items ?? [];
  const dayPartRows = dayParts ?? [];
  const recentEntryRows = recentEntries ?? [];

  const loggedByIds = Array.from(
    new Set(recentEntryRows.map((entry) => entry.logged_by).filter((id): id is string => Boolean(id))),
  );
  const { data: loggedByProfiles } = loggedByIds.length
    ? await supabase.from("profiles").select("id, name").in("id", loggedByIds)
    : { data: [] as { id: string; name: string }[] };

  const itemNameById = new Map(itemRows.map((item) => [item.id, item.name]));
  const dayPartNameById = new Map(dayPartRows.map((dayPart) => [dayPart.id, dayPart.name]));
  const loggedByNameById = new Map((loggedByProfiles ?? []).map((profile) => [profile.id, profile.name]));

  const itemsForRollup = itemRows.map((item) => ({
    id: item.id,
    name: item.name,
    categoryId: item.category_id,
    unit: item.unit as WasteUnit,
    unitCost: item.unit_cost,
  }));

  const entriesForRollup = (allEntries ?? []).map((entry) => ({
    id: entry.id,
    itemId: entry.item_id,
    quantity: entry.quantity,
    loggedAt: entry.logged_at,
  }));

  const activeTab: WasteTabKey =
    (requestedTab === "reports" && !canViewReports) || (requestedTab === "admin" && !canManage)
      ? "log"
      : requestedTab;

  // The grid banner/card totals want an entries dataset. Managers/reports
  // viewers already have the full history fetched above (entriesForRollup);
  // everyone else only has the bounded recent-entries query the Log tab
  // always runs, so the grid falls back to that instead of firing a second
  // query this stream isn't scoped to add.
  const gridEntries: WasteEntryForRollup[] = canViewReports
    ? entriesForRollup
    : recentEntryRows.map((entry) => ({
        id: entry.id,
        itemId: entry.item_id,
        quantity: entry.quantity,
        loggedAt: entry.logged_at,
      }));

  return (
    <div className="flex flex-col gap-4">
      <WasteViewTabs activeTab={activeTab} showReports={canViewReports} showAdmin={canManage} />

      {activeTab === "log" && (
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4">
          <WasteLogGrid items={itemsForRollup} categories={categoryRows} entries={gridEntries} />

          <SectionCard title="Log manually">
            <p className="mb-3 text-[13px] text-muted-ink">
              Item, quantity, and optional day part / note.
            </p>
            <LogEntryForm
              items={itemRows.map((item) => ({ id: item.id, name: item.name, unit: item.unit }))}
              dayParts={dayPartRows}
            />
          </SectionCard>

          <SectionCard
            title={selectedDate ? `Entries on ${selectedDate}` : "Recent entries"}
            flush
          >
            {/* Plain GET form: a same-day mistake older than the 25-row
                default view is still findable by date, with no client
                component needed. */}
            <form className="flex flex-wrap items-center gap-2 border-b border-line px-4 pb-3" action="/waste">
              <label className="sr-only" htmlFor="waste-date-filter">
                Filter by date
              </label>
              <input
                id="waste-date-filter"
                type="date"
                name="date"
                defaultValue={selectedDate ?? ""}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
              <Button type="submit" variant="secondary" size="sm">
                Filter
              </Button>
              {selectedDate && (
                <Button asChild type="button" variant="ghost" size="sm">
                  <Link href="/waste">Clear</Link>
                </Button>
              )}
            </form>

            {recentEntryRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted-ink">
                {selectedDate ? "No waste logged on this date." : "No waste logged yet."}
              </p>
            ) : (
              <div className="divide-y divide-line">
                {recentEntryRows.map((entry) => {
                  const donated = entry.note?.trim().toLowerCase() === "donated";
                  const dayPartName = entry.day_part_id
                    ? (dayPartNameById.get(entry.day_part_id) ?? null)
                    : null;
                  const loggedByName = entry.logged_by
                    ? (loggedByNameById.get(entry.logged_by) ?? null)
                    : null;
                  return (
                    <ListRow
                      key={entry.id}
                      icon={donated ? Heart : Trash2}
                      iconTone={donated ? "success" : "danger"}
                      title={`${itemNameById.get(entry.item_id) ?? "Item"} · ${entry.quantity}`}
                      description={[dayPartName, new Date(entry.logged_at).toLocaleString(), loggedByName]
                        .filter(Boolean)
                        .join(" · ")}
                      trailing={canManage ? <DeleteEntryButton id={entry.id} /> : undefined}
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {activeTab === "reports" && canViewReports && (
        <div className="mx-auto w-full max-w-4xl">
          <WasteReports
            entries={entriesForRollup}
            items={itemsForRollup}
            categories={categoryRows}
          />
        </div>
      )}

      {activeTab === "admin" && canManage && (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <SectionCard title="Categories">
            <CategoryManager categories={categoryRows} />
          </SectionCard>

          <SectionCard title="Items">
            <ItemManager
              items={itemsForRollup}
              categories={categoryRows.map((category) => ({
                id: category.id,
                name: category.name,
              }))}
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
