import { test, expect } from "@playwright/test";

/**
 * Reporting smoke path (PLAN.md P2 item 2: "/reports store dashboard +
 * per-module report tables ... CSV export on every table"). The fixture
 * admin is a Location Manager (see e2e/global-setup.ts), so every
 * permission-gated tab renders rather than a LockedSection.
 *
 * This spec's primary job is a regression guard for FIQ R1: /reports used to
 * 500 because the server page passed render/csv FUNCTIONS as props to the
 * ReportTable client component, which is not serializable across the RSC
 * boundary. If that regresses, the page throws on load and the very first
 * assertion (the "Reports" heading) fails. The suite runs against a live
 * project whose report source tables may be empty, so it asserts on the
 * page/tab/table CHROME (headings, tab switches, the Export CSV control),
 * not on specific data rows.
 */
test.describe("reports: dashboard + per-module tabs render", () => {
  test("loads the dashboard without a 500 and exposes CSV export", async ({ page }) => {
    const response = await page.goto("/reports");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();

    // A base dashboard tile that renders for every role (no permission gate).
    await expect(page.getByText("Overdue to-dos")).toBeVisible();

    // The CSV export control is present on the dashboard tables (proves the
    // client ReportTable mounted with serializable props, not a crash).
    await expect(page.getByRole("button", { name: "Export CSV" }).first()).toBeVisible();
  });

  test("switches to the Maintenance tab and shows its three reports", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("tab", { name: "Maintenance" }).click();

    await expect(page.getByText("Time to resolution by equipment")).toBeVisible();
    await expect(page.getByText("Spend by equipment")).toBeVisible();
    await expect(page.getByText("Repeat failures")).toBeVisible();
  });

  test("switches to the Waste tab and can change the period", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("tab", { name: "Waste" }).click();

    // Default period is Month.
    await expect(page.getByText("Waste by item (last 30 days)")).toBeVisible();

    // The client-side period control re-slices without a navigation.
    await page.getByRole("button", { name: "Week" }).click();
    await expect(page.getByText("Waste by item (last 7 days)")).toBeVisible();
  });
});
