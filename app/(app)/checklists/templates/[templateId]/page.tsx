import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateActiveToggle } from "@/components/checklists/template-active-toggle";
import { SectionEditor } from "@/components/checklists/section-editor";
import { SectionCreateForm } from "@/components/checklists/section-create-form";
import { ScheduleEditor } from "@/components/checklists/schedule-editor";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /checklists/templates/[templateId] -- the template editor: sections,
 * questions (with holding-mode / choices / corrective-action / photo /
 * token-value fields per ARCHITECTURE.md "Checklists"), and schedules.
 */
export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  await requirePermission("checklists.manage_templates");
  const { templateId } = await params;

  const supabase = await createClient();

  const [
    { data: template },
    { data: sections },
    { data: questions },
    { data: foodItems },
    { data: schedules },
    { data: dayParts },
    { data: positions },
    { data: teams },
  ] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select("id, name, description, active")
      .eq("id", templateId)
      .maybeSingle(),
    supabase
      .from("checklist_sections")
      .select("id, name, sort")
      .eq("template_id", templateId)
      .order("sort"),
    supabase
      .from("checklist_questions")
      .select(
        "id, section_id, sort, type, prompt, allow_na, choices, food_item_id, corrective_actions, photo_required, token_value",
      )
      .order("sort"),
    supabase.from("food_items").select("id, name, cold_min_f, cold_max_f, hot_min_f, hot_max_f").order("name"),
    supabase
      .from("checklist_schedules")
      .select(
        "id, frequency, days_of_week, day_of_month, day_part_id, start_time, due_time, assign_position_id, assign_team_id, alert_on_incomplete",
      )
      .eq("template_id", templateId),
    supabase.from("day_parts").select("id, name").order("sort"),
    supabase.from("positions").select("id, name").order("sort"),
    supabase.from("teams").select("id, name").order("name"),
  ]);

  if (!template) {
    notFound();
  }

  const sectionIds = new Set((sections ?? []).map((s) => s.id));
  const questionsBySection = new Map<string, typeof questions>();
  for (const q of questions ?? []) {
    if (!sectionIds.has(q.section_id)) continue;
    const list = questionsBySection.get(q.section_id) ?? [];
    list.push(q);
    questionsBySection.set(q.section_id, list);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <Link href="/checklists/templates" className="text-sm text-muted-foreground hover:underline">
          &larr; Templates
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
        </div>
        <TemplateActiveToggle
          templateId={template.id}
          name={template.name}
          description={template.description}
          active={template.active}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sections &amp; questions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(sections ?? []).map((section) => (
            <SectionEditor
              key={section.id}
              templateId={template.id}
              section={section}
              questions={(questionsBySection.get(section.id) ?? []).map((q) => ({
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                allowNa: q.allow_na,
                choices: q.choices,
                foodItemId: q.food_item_id,
                correctiveActions: q.corrective_actions,
                photoRequired: q.photo_required,
                tokenValue: q.token_value,
              }))}
              foodItems={(foodItems ?? []).map((f) => ({ id: f.id, name: f.name }))}
            />
          ))}
          {(sections ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No sections yet. Add the first one below.</p>
          )}
          <SectionCreateForm templateId={template.id} nextSort={(sections ?? []).length} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedules</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleEditor
            templateId={template.id}
            schedules={(schedules ?? []).map((s) => ({
              id: s.id,
              frequency: s.frequency,
              daysOfWeek: s.days_of_week,
              dayOfMonth: s.day_of_month,
              dayPartId: s.day_part_id,
              startTime: s.start_time,
              dueTime: s.due_time,
              assignPositionId: s.assign_position_id,
              assignTeamId: s.assign_team_id,
              alertOnIncomplete: s.alert_on_incomplete,
            }))}
            dayParts={dayParts ?? []}
            positions={positions ?? []}
            teams={teams ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
