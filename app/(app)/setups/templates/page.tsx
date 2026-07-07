import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutEditor } from "@/components/setups/layout-editor";
import { PositionsManager } from "@/components/setups/positions-manager";
import { TemplateEditor } from "@/components/setups/template-editor";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /setups/templates — ARCHITECTURE.md page map: "Manage setup templates,
 * groups, positions, and the store layout editor." Management-only route
 * (setups.manage), unlike the read-mostly /setups board.
 */
export default async function SetupTemplatesPage() {
  await requirePermission("setups.manage");
  const supabase = await createClient();

  const [{ data: dayParts }, { data: groups }, { data: positions }, { data: templates }, { data: templatePositions }, { data: layouts }, { data: tiles }] =
    await Promise.all([
      supabase.from("day_parts").select("id, name, start_time, end_time").order("sort"),
      supabase.from("position_groups").select("id, name, sort").order("sort"),
      supabase.from("positions").select("id, group_id, name, sort").order("sort"),
      supabase.from("setup_templates").select("id, name, day_part_id"),
      supabase.from("setup_template_positions").select("template_id, position_id, sort").order("sort"),
      supabase.from("store_layouts").select("id, name, day_part_id, active"),
      supabase.from("layout_tiles").select("id, layout_id, position_id, x, y, w, h, area_label"),
    ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Setup templates</h1>
        <p className="text-sm text-muted-foreground">
          Manage position groups, setup templates, and the store layout editor.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="layout">Store layout</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Setup templates</CardTitle>
              <CardDescription>
                Define which positions a day-part needs, in order.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateEditor
                dayParts={dayParts ?? []}
                positions={positions ?? []}
                templates={templates ?? []}
                templatePositions={templatePositions ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>Position groups &amp; positions</CardTitle>
              <CardDescription>
                The stations setups and the layout board are built from.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PositionsManager groups={groups ?? []} positions={positions ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="layout">
          <Card>
            <CardHeader>
              <CardTitle>Store layout editor</CardTitle>
              <CardDescription>
                Drag position tiles onto a canvas mirroring the store floor plan. List view is the fallback.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LayoutEditor
                dayParts={dayParts ?? []}
                positions={positions ?? []}
                layouts={layouts ?? []}
                tiles={tiles ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
