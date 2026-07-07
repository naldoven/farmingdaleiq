import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { serviceRoleClient } from "../fixtures/service-role";

/**
 * Catering happy path (PLAN.md S9 "Done": "create order -> walk all stages
 * with checklists -> close -> follow-up queued -> analytics update"). This
 * spec covers create + the first stage move (new -> confirm) via the
 * accessible stage-dropdown fallback (ARCHITECTURE.md: "Cards move by drag
 * or a stage dropdown" -- component doc comment in components/catering/
 * order-card.tsx); native HTML5 drag-and-drop on the kanban board is not
 * exercised here since Playwright's dataTransfer support for it is fiddly
 * and the dropdown is the same server action (`changeStage`) underneath.
 * Walking every remaining stage through to "closed" (which needs the
 * follow-up queue + analytics rollups too) is real coverage but heavier
 * fixture-wise for marginal additional proof of the same `changeStage`
 * action, so it's left to S9's own tests.
 */
test.describe("catering: create an order and move it through a stage", () => {
  let admin: SupabaseClient<Database>;
  let orderId: string | null = null;
  const guestName = `E2E Catering Guest ${Date.now()}`;
  const phone = `555${Date.now().toString().slice(-7)}`;

  test.afterAll(async () => {
    if (orderId) {
      // cascades catering_order_items, catering_checklist_items, catering_followups
      await admin.from("catering_orders").delete().eq("id", orderId);
    }
    await admin.from("catering_contacts").delete().eq("phone", phone);
  });

  test("create order -> stage select moves it to Confirmation Call", async ({ page }) => {
    admin = serviceRoleClient();

    await page.goto("/catering/new");
    await page.getByLabel("Guest name").fill(guestName);
    await page.getByLabel("Phone").fill(phone);
    await page.getByLabel("Event date").fill("2031-06-01");
    await page.getByLabel("Headcount").fill("25");

    await page.getByRole("button", { name: "Create order" }).click();
    await expect(page).toHaveURL(/\/catering\/orders\/[0-9a-f-]+/);

    const url = page.url();
    orderId = url.split("/catering/orders/")[1];
    expect(orderId).toBeTruthy();

    await expect(page.getByRole("heading", { name: guestName })).toBeVisible();

    const { data: created } = await admin.from("catering_orders").select("stage").eq("id", orderId as string).single();
    expect(created?.stage).toBe("new");

    // The stage select is the first Radix combobox trigger on the page (it
    // renders right after the heading, ahead of the order-details form's own
    // Fulfillment select) -- name-based lookup is unreliable here since the
    // trigger's accessible name updates the instant a value is chosen.
    const stageSelect = page.locator('button[role="combobox"]').first();
    await stageSelect.click();
    await page.getByRole("option", { name: "Confirmation Call" }).click();

    await expect(stageSelect).toHaveText("Confirmation Call");

    const { data: moved } = await admin.from("catering_orders").select("stage").eq("id", orderId as string).single();
    expect(moved?.stage).toBe("confirm");

    await page.goto("/catering");
    // The guest name also appears in the "New orders today" strip's badge
    // (this order was created moments ago) in addition to its kanban card
    // link -- .first() is enough since we only care that it shows up
    // somewhere on the board, not which one.
    await expect(page.getByText(guestName).first()).toBeVisible();
  });
});
