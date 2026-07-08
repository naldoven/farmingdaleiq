import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard } from "@/components/mobile";
import { LayoutEditor } from "@/components/setups/layout-editor";
import { PositionsManager } from "@/components/setups/positions-manager";
import { TemplateEditor } from "@/components/setups/template-editor";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /setups/templates — ARCHITECTURE.md page map: "Manage setup templates,
 * groups, positions, and the store layout editor." Management-only route
 * (setups.manage), unlike the read-mostly /setups board.
 *
 * KitchenIQ mobile redesign (docs/DESIGN-SYSTEM.md): each tab's content sits
 * in a white rounded SectionCard instead of the old shadcn Card. Visual/
 * layout only — queries and permission gate are unchanged.
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
    <div className="mx-auto flex max-w-[560px] flex-col gap-4">
      <div>
        <p className="text-[13px] text-muted-ink">
          Manage position groups, setup templates, and the store layout editor.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="w-full">
          <TabsTrigger value="templates" className="flex-1">
            Templates
          </TabsTrigger>
          <TabsTrigger value="positions" className="flex-1">
            Positions
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1">
            Store layout
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <SectionCard
            title="Setup templates"
            className="flex flex-col gap-1"
          >
            <p className="-mt-2 mb-2 text-[13px] text-muted-ink">
              Define which positions a day-part needs, in order.
            </p>
            <TemplateEditor
              dayParts={dayParts ?? []}
              positions={positions ?? []}
              templates={templates ?? []}
              templatePositions={templatePositions ?? []}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="positions" className="mt-4">
          <SectionCard title="Position groups & positions">
            <p className="-mt-2 mb-2 text-[13px] text-muted-ink">
              The stations setups and the layout board are built from.
            </p>
            <PositionsManager groups={groups ?? []} positions={positions ?? []} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="layout" className="mt-4">
          <SectionCard title="Store layout editor">
            <p className="-mt-2 mb-2 text-[13px] text-muted-ink">
              Drag position tiles onto a canvas mirroring the store floor plan. List view is the fallback.
            </p>
            <LayoutEditor
              dayParts={dayParts ?? []}
              positions={positions ?? []}
              layouts={layouts ?? []}
              tiles={tiles ?? []}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
