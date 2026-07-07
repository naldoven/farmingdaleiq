import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { readAdminInfo } from "../fixtures/admin-info";
import { serviceRoleClient } from "../fixtures/service-role";

// Far-future date so this never collides with a real setup someone posts
// for today/this week while the suite is running against the live project.
const FIXTURE_DATE = "2031-01-15";

/**
 * Setups happy path (PLAN.md S3 "Done": "build setup from template on
 * layout view, post it, ..."). Uses the list-view board (`/setups`), the
 * default view per that page's own comment ("kept as the default here since
 * a posted setup's assignments aren't yet tied to layout_tiles positions").
 *
 * Every seeded day-part (Morning/Lunch/Mid/Dinner/Night/Closing, see
 * supabase/migrations/20260707001900_seed_store_config.sql) is under the
 * 360-minute threshold of the one seeded break rule, so posting this fixture
 * setup does not generate any `breaks` rows -- confirmed by asserting
 * `breaks` is empty for this setup below, which also means afterAll doesn't
 * need to worry about breaks.setup_id (no ON DELETE CASCADE from setups)
 * blocking cleanup.
 */
test.describe("setups: create, assign, and post", () => {
  let admin: SupabaseClient<Database>;
  let adminUserId: string;
  let dayPartId: string;
  let positionId: string;
  let templateId: string;
  let setupId: string | null = null;

  test.beforeAll(async () => {
    admin = serviceRoleClient();
    adminUserId = readAdminInfo().userId;

    const { data: dayPart, error: dayPartError } = await admin
      .from("day_parts")
      .select("id")
      .eq("name", "Morning")
      .maybeSingle();
    if (dayPartError || !dayPart) throw new Error(`fixture: "Morning" day-part not found: ${dayPartError?.message}`);
    dayPartId = dayPart.id;

    const { data: position, error: positionError } = await admin
      .from("positions")
      .select("id")
      .eq("name", "Register 1")
      .maybeSingle();
    if (positionError || !position) throw new Error(`fixture: "Register 1" position not found: ${positionError?.message}`);
    positionId = position.id;

    const { data: template, error: templateError } = await admin
      .from("setup_templates")
      .insert({ name: `E2E Setup Template ${Date.now()}`, day_part_id: dayPartId })
      .select("id")
      .single();
    if (templateError || !template) throw new Error(`fixture: create setup_template failed: ${templateError?.message}`);
    templateId = template.id;

    const { error: templatePositionError } = await admin
      .from("setup_template_positions")
      .insert({ template_id: templateId, position_id: positionId, sort: 0 });
    if (templatePositionError) {
      throw new Error(`fixture: link setup_template_positions failed: ${templatePositionError.message}`);
    }
  });

  test.afterAll(async () => {
    if (setupId) {
      // Defensive: no break rule is short enough to fire for these seeded
      // day-parts (see the spec-level comment above), but delete any
      // breaks.setup_id rows first anyway since that FK is NOT cascading.
      await admin.from("breaks").delete().eq("setup_id", setupId);
      await admin.from("setups").delete().eq("id", setupId); // cascades setup_assignments + shift_notes
    }
    if (templateId) {
      await admin.from("setup_template_positions").delete().eq("template_id", templateId);
      await admin.from("setup_templates").delete().eq("id", templateId);
    }
  });

  test("create a setup from a template, assign the admin, and post it", async ({ page }) => {
    await page.goto(`/setups?date=${FIXTURE_DATE}&dayPartId=${dayPartId}`);
    await expect(page.getByRole("heading", { name: "Setup board" })).toBeVisible();

    // The date/day-part switcher form above the board also renders a native
    // `<select>`, which the accessibility tree reports as role "combobox"
    // too -- scope to Radix's `<button role="combobox">` triggers so this
    // doesn't collide with it.
    const comboboxes = page.locator('button[role="combobox"]');

    await comboboxes.first().click();
    await page.getByRole("option", { name: /E2E Setup Template/ }).click();
    await page.getByRole("button", { name: "Create setup from template" }).click();

    await expect(page.getByText("Draft")).toBeVisible();

    await comboboxes.first().click();
    await page.getByRole("option", { name: "E2E Admin" }).click();

    await page.getByRole("button", { name: "Post setup" }).click();
    await expect(page.getByText("Posted")).toBeVisible();

    const { data: setup } = await admin
      .from("setups")
      .select("id, posted_at")
      .eq("date", FIXTURE_DATE)
      .eq("day_part_id", dayPartId)
      .maybeSingle();
    expect(setup?.posted_at).not.toBeNull();
    setupId = setup?.id ?? null;

    const { data: assignment } = await admin
      .from("setup_assignments")
      .select("user_id")
      .eq("setup_id", setupId as string)
      .eq("position_id", positionId)
      .maybeSingle();
    expect(assignment?.user_id).toBe(adminUserId);
  });
});
