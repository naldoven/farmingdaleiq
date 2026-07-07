import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { serviceRoleClient } from "../fixtures/service-role";

/**
 * Checklists happy path (PLAN.md S1 "Done": "create template -> schedule ->
 * run appears -> complete with a failed temp -> corrective action forced ->
 * follow-up created -> event emitted"). The template/section/question/run
 * are seeded directly via the service-role client rather than through the
 * template-builder UI: this spec is about the run PLAYER (completing a
 * checklist), which is the module's core "Done" behavior and the piece every
 * shift actually uses daily; the template-builder UI is exercised by S1's
 * own unit/component tests, not duplicated here.
 */
test.describe("checklists: complete a run", () => {
  let admin: SupabaseClient<Database>;
  let templateId: string;
  let sectionId: string;
  let yesNoQuestionId: string;
  let tempQuestionId: string;
  let runId: string;

  test.beforeAll(async () => {
    admin = serviceRoleClient();

    const { data: template, error: templateError } = await admin
      .from("checklist_templates")
      .insert({ name: `E2E Checklist ${Date.now()}`, active: true })
      .select("id")
      .single();
    if (templateError || !template) throw new Error(`fixture: create template failed: ${templateError?.message}`);
    templateId = template.id;

    const { data: section, error: sectionError } = await admin
      .from("checklist_sections")
      .insert({ template_id: templateId, name: "Line check", sort: 0 })
      .select("id")
      .single();
    if (sectionError || !section) throw new Error(`fixture: create section failed: ${sectionError?.message}`);
    sectionId = section.id;

    const { data: foodItem } = await admin.from("food_items").select("id").eq("name", "Cold Foods").maybeSingle();

    const { data: questions, error: questionsError } = await admin
      .from("checklist_questions")
      .insert([
        { section_id: sectionId, sort: 0, type: "yes_no", prompt: "Line stocked?", allow_na: false },
        {
          section_id: sectionId,
          sort: 1,
          type: "temperature",
          prompt: "Walk-in cooler temp",
          allow_na: false,
          food_item_id: foodItem?.id ?? null,
          corrective_actions: "Move product to backup cooler and log a work order.",
        },
      ])
      .select("id, type");
    if (questionsError || !questions) throw new Error(`fixture: create questions failed: ${questionsError?.message}`);
    yesNoQuestionId = questions.find((q) => q.type === "yes_no")!.id;
    tempQuestionId = questions.find((q) => q.type === "temperature")!.id;

    const today = new Date().toISOString().slice(0, 10);
    const { data: run, error: runError } = await admin
      .from("checklist_runs")
      .insert({ template_id: templateId, run_date: today, status: "pending" })
      .select("id")
      .single();
    if (runError || !run) throw new Error(`fixture: create run failed: ${runError?.message}`);
    runId = run.id;
  });

  test.afterAll(async () => {
    // The test itself deletes any follow_ups it created (they reference
    // checklist_answers, which reference this run) before this runs.
    if (runId) {
      await admin.from("checklist_answers").delete().eq("run_id", runId);
      await admin.from("checklist_runs").delete().eq("id", runId);
    }
    if (sectionId) await admin.from("checklist_questions").delete().eq("section_id", sectionId);
    if (templateId) {
      await admin.from("checklist_sections").delete().eq("template_id", templateId);
      await admin.from("checklist_templates").delete().eq("id", templateId);
    }
  });

  test("an out-of-range temperature forces a corrective action and completing the run works", async ({ page }) => {
    await page.goto(`/checklists/${runId}`);
    await expect(page.getByRole("heading", { name: /E2E Checklist/ })).toBeVisible();

    await page.getByRole("button", { name: "Yes" }).click();

    // Cold Foods holding range is 33-41F; 60F is out of range and should
    // force a corrective-action note before the run can complete.
    const tempInput = page.locator('input[type="number"]').first();
    await tempInput.fill("60");

    await page.getByRole("button", { name: "Complete checklist" }).click();
    await expect(page.getByText(/need attention before you can finish/)).toBeVisible();

    const correctiveNote = page.getByPlaceholder("Move product to backup cooler and log a work order.");
    await correctiveNote.fill("Moved product to the backup cooler, logged a work order.");

    await page.getByRole("button", { name: "Complete checklist" }).click();
    await expect(page.getByText("Checklist completed.")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();

    const { data: run } = await admin
      .from("checklist_runs")
      .select("status, completed_at, completed_by")
      .eq("id", runId)
      .single();
    expect(run?.status).toBe("completed");
    expect(run?.completed_at).not.toBeNull();

    const { data: yesNoAnswer } = await admin
      .from("checklist_answers")
      .select("value, flagged")
      .eq("run_id", runId)
      .eq("question_id", yesNoQuestionId)
      .maybeSingle();
    expect(yesNoAnswer?.value).toBe(true);
    expect(yesNoAnswer?.flagged).toBe(false);

    const { data: tempAnswer } = await admin
      .from("checklist_answers")
      .select("flagged, corrective_action_note")
      .eq("run_id", runId)
      .eq("question_id", tempQuestionId)
      .maybeSingle();
    expect(tempAnswer?.flagged).toBe(true);
    expect(tempAnswer?.corrective_action_note).toContain("backup cooler");

    const { data: followUps } = await admin
      .from("follow_ups")
      .select("id, description")
      .in(
        "source_answer_id",
        (
          await admin
            .from("checklist_answers")
            .select("id")
            .eq("run_id", runId)
            .eq("question_id", tempQuestionId)
        ).data?.map((a) => a.id) ?? [],
      );
    expect(followUps?.length ?? 0).toBeGreaterThan(0);

    // Cleanup follow-ups created by this run before afterAll deletes the run.
    if (followUps?.length) {
      await admin
        .from("follow_ups")
        .delete()
        .in("id", followUps.map((f) => f.id));
    }
  });
});
