import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MenuItemForm } from "@/components/catering/menu-item-form";
import { MenuItemRowActions } from "@/components/catering/menu-item-row-actions";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ChecklistDefaultsManager } from "@/app/(app)/catering/menu/checklist-defaults-manager";
import type { ChecklistStage } from "@/app/(app)/catering/logic";

/**
 * /catering/menu — ARCHITECTURE.md page map: "Menu item catalog admin
 * (components, scaling rules)." Also owns per-stage checklist default
 * templates (parity audit Catering finding: "No admin UI for per-stage
 * checklist default templates").
 */
export default async function CateringMenuPage() {
  await requirePermission("catering.view");
  const canManage = await hasPermission("catering.manage");

  const supabase = await createClient();
  const [{ data: menuItems }, { data: checklistDefaults }] = await Promise.all([
    supabase
      .from("catering_menu_items")
      .select("id, name, category, components, scaling_rules, active")
      .order("name"),
    supabase
      .from("catering_checklist_defaults")
      .select("id, stage, label, active")
      .order("sort"),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Catering menu</h1>

      {canManage && <MenuItemForm />}

      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(menuItems ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.category ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={item.active ? "success" : "outline"}>
                      {item.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <MenuItemRowActions
                        item={{
                          id: item.id,
                          name: item.name,
                          category: item.category ?? "",
                          componentsText: JSON.stringify(item.components ?? []),
                          scalingRulesText: JSON.stringify(item.scaling_rules ?? []),
                          active: item.active,
                        }}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(menuItems ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground">
                    No menu items yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Per-stage checklist defaults</CardTitle>
          </CardHeader>
          <CardContent>
            <ChecklistDefaultsManager
              defaults={(checklistDefaults ?? []).map((d) => ({
                id: d.id,
                stage: d.stage as ChecklistStage,
                label: d.label,
                active: d.active,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
