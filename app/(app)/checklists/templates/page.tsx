import { ClipboardList } from "lucide-react";

import { ListRow, SectionCard, SectionLabel, StatusBadge } from "@/components/mobile";
import { TemplateCreateForm } from "@/components/checklists/template-create-form";
import { FoodItemsManager } from "@/components/checklists/food-items-manager";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /checklists/templates -- ARCHITECTURE.md page map: "Build/edit templates,
 * sections, questions, schedules (permission-gated)." checklists.manage_
 * templates is required for the whole route (create/list here, edit inside
 * app/(app)/checklists/templates/[templateId]/page.tsx). Restyled onto the
 * KitchenIQ mobile design system (docs/DESIGN-SYSTEM.md).
 */
export default async function ChecklistTemplatesPage() {
  await requirePermission("checklists.manage_templates");

  const supabase = await createClient();

  const [{ data: templates }, { data: sections }, { data: schedules }, { data: foodItems }] =
    await Promise.all([
      supabase
        .from("checklist_templates")
        .select("id, name, description, active")
        .order("name"),
      supabase.from("checklist_sections").select("id, template_id"),
      supabase.from("checklist_schedules").select("id, template_id, frequency"),
      supabase
        .from("food_items")
        .select("id, name, cold_min_f, cold_max_f, hot_min_f, hot_max_f")
        .order("name"),
    ]);

  const sectionCountByTemplate = new Map<string, number>();
  for (const s of sections ?? []) {
    sectionCountByTemplate.set(s.template_id, (sectionCountByTemplate.get(s.template_id) ?? 0) + 1);
  }
  const scheduleCountByTemplate = new Map<string, number>();
  for (const s of schedules ?? []) {
    scheduleCountByTemplate.set(s.template_id, (scheduleCountByTemplate.get(s.template_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <SectionLabel>New Template</SectionLabel>
      <SectionCard>
        <TemplateCreateForm />
      </SectionCard>

      <SectionLabel>Templates ({(templates ?? []).length})</SectionLabel>
      {(templates ?? []).length === 0 ? (
        <SectionCard>
          <p className="text-[13px] text-muted-ink">No templates yet.</p>
        </SectionCard>
      ) : (
        <SectionCard flush>
          <div className="divide-y divide-line">
            {(templates ?? []).map((template) => (
              <ListRow
                key={template.id}
                icon={ClipboardList}
                iconTone="accent"
                title={template.name}
                description={
                  template.description ??
                  `${sectionCountByTemplate.get(template.id) ?? 0} sections · ${
                    scheduleCountByTemplate.get(template.id) ?? 0
                  } schedules`
                }
                href={`/checklists/templates/${template.id}`}
                trailing={
                  <StatusBadge tone={template.active ? "success" : "neutral"}>
                    {template.active ? "Active" : "Inactive"}
                  </StatusBadge>
                }
              />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Food Items">
        <FoodItemsManager
          foodItems={(foodItems ?? []).map((f) => ({
            id: f.id,
            name: f.name,
            coldMinF: f.cold_min_f,
            coldMaxF: f.cold_max_f,
            hotMinF: f.hot_min_f,
            hotMaxF: f.hot_max_f,
          }))}
        />
      </SectionCard>
    </div>
  );
}
