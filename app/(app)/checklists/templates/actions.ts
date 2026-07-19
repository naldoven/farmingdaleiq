"use server";

/**
 * Server actions for the Checklists template builder (ARCHITECTURE.md
 * "Checklists" -> templates/sections/questions/schedules; also food_items,
 * which S1 owns per docs/agent-map.md). Follows the People/Teams
 * permission-guard pattern (app/(app)/people/actions.ts): every action
 * requires `checklists.manage_templates` server-side before any write, and
 * mutations go through the per-request client so RLS re-checks the same
 * permission independently.
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/db/types";
import type { ActionResult } from "@/app/(app)/checklists/action-types";
import { getMultiChoiceOptions } from "@/app/(app)/checklists/logic";
import {
  foodItemSchema,
  idSchema,
  questionSchema,
  scheduleSchema,
  sectionSchema,
  templateSchema,
  updateTemplateSchema,
  type FoodItemInput,
  type QuestionInput,
  type ScheduleInput,
  type SectionInput,
  type TemplateInput,
  type UpdateTemplateInput,
} from "@/app/(app)/checklists/templates/validation";

function revalidateTemplates(templateId?: string) {
  revalidatePath("/checklists/templates");
  if (templateId) revalidatePath(`/checklists/templates/${templateId}`);
}

export async function createTemplate(input: TemplateInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("checklists.manage_templates");
    const parsed = templateSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("checklist_templates")
      .insert({ name: parsed.name, description: parsed.description || null })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create template." };

    revalidateTemplates();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateTemplate(input: UpdateTemplateInput): Promise<ActionResult> {
  try {
    await requirePermission("checklists.manage_templates");
    const parsed = updateTemplateSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("checklist_templates")
      .update({ name: parsed.name, description: parsed.description || null, active: parsed.active })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };

    revalidateTemplates(parsed.id);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function createSection(input: SectionInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("checklists.manage_templates");
    const parsed = sectionSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("checklist_sections")
      .insert({ template_id: parsed.templateId, name: parsed.name, sort: parsed.sort })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create section." };

    revalidateTemplates(parsed.templateId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteSection(input: { id: string; templateId: string }): Promise<ActionResult> {
  try {
    await requirePermission("checklists.manage_templates");
    const { id } = idSchema.parse({ id: input.id });
    const supabase = await createClient();

    const { error } = await supabase.from("checklist_sections").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidateTemplates(input.templateId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Question type/holding-mode encoding: temperature questions store their
 * holding mode in `choices` as `{ holding_mode }` and multi_choice questions
 * store their option list in `choices` as a string array (see
 * app/(app)/checklists/logic.ts doc comment -- there's no dedicated schema
 * column for holding mode).
 */
function buildChoicesColumn(parsed: QuestionInput): Json | null {
  if (parsed.type === "temperature") {
    return { holding_mode: parsed.holdingMode };
  }
  if (parsed.type === "multi_choice") {
    return getMultiChoiceOptions({
      choices: (parsed.choicesText ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    });
  }
  return null;
}

export async function createQuestion(
  input: QuestionInput & { templateId: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("checklists.manage_templates");
    const parsed = questionSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("checklist_questions")
      .insert({
        section_id: parsed.sectionId,
        type: parsed.type,
        prompt: parsed.prompt,
        allow_na: parsed.allowNa,
        choices: buildChoicesColumn(parsed),
        food_item_id: parsed.type === "temperature" ? parsed.foodItemId ?? null : null,
        corrective_actions: parsed.correctiveActions || null,
        photo_required: parsed.photoRequired,
        token_value: parsed.tokenValue,
        sort: parsed.sort,
      })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create question." };

    revalidateTemplates(input.templateId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteQuestion(input: { id: string; templateId: string }): Promise<ActionResult> {
  try {
    await requirePermission("checklists.manage_templates");
    const { id } = idSchema.parse({ id: input.id });
    const supabase = await createClient();

    const { error } = await supabase.from("checklist_questions").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidateTemplates(input.templateId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function createSchedule(input: ScheduleInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("checklists.manage_templates");
    const parsed = scheduleSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("checklist_schedules")
      .insert({
        template_id: parsed.templateId,
        frequency: parsed.frequency,
        days_of_week: parsed.frequency === "weekly" ? parsed.daysOfWeek : null,
        day_of_month: parsed.frequency === "monthly" ? parsed.dayOfMonth ?? null : null,
        day_part_id: parsed.dayPartId ?? null,
        start_time: parsed.startTime || null,
        due_time: parsed.dueTime || null,
        assign_position_id: parsed.assignPositionId ?? null,
        assign_team_id: parsed.assignTeamId ?? null,
        alert_on_incomplete: parsed.alertOnIncomplete,
      })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create schedule." };

    revalidateTemplates(parsed.templateId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteSchedule(input: { id: string; templateId: string }): Promise<ActionResult> {
  try {
    await requirePermission("checklists.manage_templates");
    const { id } = idSchema.parse({ id: input.id });
    const supabase = await createClient();

    const { error } = await supabase.from("checklist_schedules").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidateTemplates(input.templateId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function createFoodItem(input: FoodItemInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("checklists.manage_templates");
    const parsed = foodItemSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("food_items")
      .insert({
        name: parsed.name,
        cold_min_f: parsed.coldMinF ?? null,
        cold_max_f: parsed.coldMaxF ?? null,
        hot_min_f: parsed.hotMinF ?? null,
        hot_max_f: parsed.hotMaxF ?? null,
      })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create food item." };

    revalidateTemplates();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteFoodItem(input: { id: string }): Promise<ActionResult> {
  try {
    await requirePermission("checklists.manage_templates");
    const { id } = idSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("food_items").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
