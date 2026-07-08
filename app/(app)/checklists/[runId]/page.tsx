import { notFound } from "next/navigation";

import { SectionLabel } from "@/components/mobile";
import { RunPlayerForm } from "@/components/checklists/run-player-form";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /checklists/[runId] -- the mobile-first run player (ARCHITECTURE.md page
 * map: "run player UI"). Renders every section/question for the run's
 * template alongside any already-saved answers, and hands off to the client
 * form for local editing + save/complete.
 */
export default async function ChecklistRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  await requirePermission("checklists.complete");
  const { runId } = await params;

  const supabase = await createClient();

  const { data: run } = await supabase
    .from("checklist_runs")
    .select("id, template_id, status, run_date")
    .eq("id", runId)
    .maybeSingle();

  if (!run) {
    notFound();
  }

  const [{ data: template }, { data: sections }, { data: answers }] = await Promise.all([
    supabase.from("checklist_templates").select("id, name, description").eq("id", run.template_id).maybeSingle(),
    supabase
      .from("checklist_sections")
      .select("id, name, sort")
      .eq("template_id", run.template_id)
      .order("sort"),
    supabase
      .from("checklist_answers")
      .select("question_id, value, is_na, flagged, corrective_action_note, comment, photo_url")
      .eq("run_id", runId),
  ]);

  const sectionIds = (sections ?? []).map((s) => s.id);
  const { data: questions } = sectionIds.length
    ? await supabase
        .from("checklist_questions")
        .select(
          "id, section_id, sort, type, prompt, allow_na, choices, food_item_id, corrective_actions, photo_required, token_value",
        )
        .in("section_id", sectionIds)
        .order("sort")
    : { data: [] };

  const foodItemIds = Array.from(
    new Set((questions ?? []).map((q) => q.food_item_id).filter((id): id is string => Boolean(id))),
  );
  const { data: foodItems } = foodItemIds.length
    ? await supabase
        .from("food_items")
        .select("id, name, cold_min_f, cold_max_f, hot_min_f, hot_max_f")
        .in("id", foodItemIds)
    : { data: [] };

  const questionsBySection = new Map<string, typeof questions>();
  for (const q of questions ?? []) {
    const list = questionsBySection.get(q.section_id) ?? [];
    list.push(q);
    questionsBySection.set(q.section_id, list);
  }

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 pb-24">
      <div>
        <SectionLabel>{template?.name ?? "Checklist"}</SectionLabel>
        {template?.description && <p className="text-[13px] text-muted-ink">{template.description}</p>}
      </div>

      <RunPlayerForm
        runId={run.id}
        status={run.status}
        sections={(sections ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          questions: (questionsBySection.get(s.id) ?? []).map((q) => ({
            id: q.id,
            type: q.type,
            prompt: q.prompt,
            allow_na: q.allow_na,
            choices: q.choices,
            food_item_id: q.food_item_id,
            correctiveActions: q.corrective_actions,
            photo_required: q.photo_required,
          })),
        }))}
        foodItems={(foodItems ?? []).map((f) => ({
          id: f.id,
          cold_min_f: f.cold_min_f,
          cold_max_f: f.cold_max_f,
          hot_min_f: f.hot_min_f,
          hot_max_f: f.hot_max_f,
        }))}
        initialAnswers={(answers ?? []).map((a) => ({
          questionId: a.question_id,
          value: a.value as string | number | boolean | null,
          isNa: a.is_na,
          manuallyFlagged: a.flagged,
          correctiveActionNote: a.corrective_action_note,
          comment: a.comment,
          photoUrl: a.photo_url,
        }))}
      />
    </div>
  );
}
