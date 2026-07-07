import { Badge } from "@/components/ui/badge";
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
export default async function WastePage() {
  // waste.log is a base permission granted to every seeded role (see
  // supabase/migrations/20260707001900_seed_store_config.sql base_keys), so
  // in practice every active team member can reach this page to log waste.
  await requirePermission("waste.log");
  const canManage = await hasPermission("waste.manage");

  const supabase = await createClient();

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
    supabase
      .from("waste_entries")
      .select("id, item_id, quantity, note, logged_at, day_part_id")
      .order("logged_at", { ascending: false })
      .limit(25),
    // Reports tab is manager-only, so only pull the full entry history when
    // it's actually needed for the rollups.
    canManage
      ? supabase.from("waste_entries").select("id, item_id, quantity, logged_at")
      : Promise.resolve({ data: [] as { id: string; item_id: string; quantity: number; logged_at: string }[] }),
  ]);

  const categoryRows = categories ?? [];
  const itemRows = items ?? [];
  const dayPartRows = dayParts ?? [];

  const itemNameById = new Map(itemRows.map((item) => [item.id, item.name]));
  const dayPartNameById = new Map(dayPartRows.map((dayPart) => [dayPart.id, dayPart.name]));

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
          {canManage && <TabsTrigger value="reports">Reports</TabsTrigger>}
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
            <CardHeader>
              <CardTitle>Recent entries</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Day part</TableHead>
                    <TableHead>Logged</TableHead>
                    {canManage && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentEntries ?? []).map((entry) => (
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
                      {canManage && (
                        <TableCell>
                          <DeleteEntryButton id={entry.id} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {(recentEntries ?? []).length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={canManage ? 5 : 4}
                        className="text-center text-muted-foreground"
                      >
                        No waste logged yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canManage && (
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
