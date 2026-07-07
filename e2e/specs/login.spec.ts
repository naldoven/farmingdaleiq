import { test, expect } from "@playwright/test";

/**
 * Login / auth gate coverage. Runs in the "unauthenticated" project (no
 * storageState), unlike every other spec here.
 *
 * NOTE ON SCOPE: this repo has no `/login` page (`app/(app)/layout.tsx`
 * redirects unauthenticated users to `/login`, but no `app/login/page.tsx`
 * exists anywhere in the codebase) -- see the final report / PR description
 * for this stream. Building that page is outside e2e/**'s ownership, so
 * there is no login FORM for Playwright to fill in and submit. What IS
 * covered here, against the real app and the real Supabase project:
 *   1. an unauthenticated request to a protected route is actually gated
 *      (middleware redirects to /login), and
 *   2. a real Supabase Auth session (created via the Admin API + a genuine
 *      password sign-in in global-setup.ts, not a mock) is accepted end to
 *      end -- the authenticated project's storageState is reused by every
 *      other spec in this suite, so every one of them is implicitly a
 *      second, broader proof that the real auth flow works.
 */
test.describe("authentication gate", () => {
  test("unauthenticated visitors are redirected to /login", async ({ page }) => {
    // Middleware issues the redirect regardless of whether /login itself has
    // a page (it currently doesn't -- see the module doc comment above), so
    // this only asserts the redirect's destination, not the final response
    // status.
    await page.goto("/checklists");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test("unauthenticated visitors cannot reach protected data", async ({ page }) => {
    await page.goto("/rewards");
    await expect(page).toHaveURL(/\/login(\?|$)/);
    // Sanity: the redirect actually left the protected page, it didn't just
    // append to the URL while still rendering the guarded content.
    await expect(page.getByText("Redeem tokens for real rewards.")).toHaveCount(0);
  });
});
