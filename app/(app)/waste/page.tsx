import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryManager } from "@/components/waste/category-manager";
import { DeleteEntryButton } from "@/components/waste/delete-entry-button";
import { ItemManager } from "@/components/waste/item-manager";
import { LogEntryForm } from "@/components/waste/log-entry-form";
import { WasteReports } from "@/components/waste/waste-reports";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { WasteUnit } from "@/app/(app)/waste/validation";

/**
 * /waste -- ARCHITECTURE.md page map: "Quick waste logging; admin:
 * categories/items." PLAN.md S5 done-definition covers logging + admin CRUD
 * + rollups, all of which live on this single route (docs/agent-map.md only
 * lists "/waste" for this stream, unlike streams that were granted explicit
 * sub-routes), so it's one page with permission-gated tabs rather than
 * separate routes.
 */
/** YYYY-MM-DD, no other characters -- guards the date search param before it
 * reaches a query bound (bad input just falls back to the default view). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Hard ceiling on an explicit date filter so a leader can't accidentally
 * request an unbounded scan; comfortably above any single day's real volume. */
const DATE_FILTER_LIMIT = 500;

export default async function WastePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
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

  const { date } = await searchParams;
  const selectedDate = date && ISO_DATE_RE.test(date) ? date : null;

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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Waste</h1>
        <Badge variant="outline">S5</Badge>
      </div>

      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Log</TabsTrigger>
          {canViewReports && <TabsTrigger value="reports">Reports</TabsTrigger>}
          {canManage && <TabsTrigger value="admin">Admin</TabsTrigger>}
        </TabsList>

        <TabsContent value="log" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Log waste</CardTitle>
              <CardDescription>Item, quantity, and optional day part / note.</CardDescription>
            </CardHeader>
            <CardContent>
              <LogEntryForm
                items={itemRows.map((item) => ({ id: item.id, name: item.name, unit: item.unit }))}
                dayParts={dayPartRows}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>
                {selectedDate ? `Entries on ${selectedDate}` : "Recent entries"}
              </CardTitle>
              {/* Plain GET form: a same-day mistake older than the 25-row
                  default view is still findable by date, with no client
                  component needed. */}
              <form className="flex items-center gap-2" action="/waste">
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
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Day part</TableHead>
                    <TableHead>Logged</TableHead>
                    <TableHead>Logged by</TableHead>
                    {canManage && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEntryRows.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {itemNameById.get(entry.item_id) ?? "Item"}
                      </TableCell>
                      <TableCell>{entry.quantity}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.day_part_id ? (dayPartNameById.get(entry.day_part_id) ?? "—") : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(entry.logged_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.logged_by ? (loggedByNameById.get(entry.logged_by) ?? "—") : "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <DeleteEntryButton id={entry.id} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {recentEntryRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={canManage ? 6 : 5}
                        className="text-center text-muted-foreground"
                      >
                        {selectedDate ? "No waste logged on this date." : "No waste logged yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canViewReports && (
          <TabsContent value="reports">
            <WasteReports
              entries={entriesForRollup}
              items={itemsForRollup}
              categories={categoryRows}
            />
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="admin" className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryManager categories={categoryRows} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemManager
                  items={itemsForRollup}
                  categories={categoryRows.map((category) => ({
                    id: category.id,
                    name: category.name,
                  }))}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
